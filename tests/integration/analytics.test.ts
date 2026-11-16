/**
 * Fase 4 — indicadores conferidos com registros conhecidos.
 * Cria uma unidade isolada (KPI_<tag>) com 2 vagas e 9 candidaturas em março/2026, com horários
 * exatos, e compara cada indicador com o valor calculado à mão (comentado ao lado).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { prisma } from "../../src/lib/prisma";
import { asUser } from "../../prisma/demo-recruitment";
import { buildReport } from "../../src/modules/analytics/report";
import { reportToPdf, reportToXlsx } from "../../src/modules/analytics/export";
import { saveTarget } from "../../src/modules/analytics/sla";

const TAG = Date.now().toString(36).toUpperCase().slice(-6);
const T = (s: string) => new Date(`${s}:00-03:00`); // horário de Brasília
let unitId = "";
let ids: Record<string, string> = {};
const targetIds: string[] = [];
const close = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a !== null && a !== undefined && Math.abs(a - b) < eps, `${a} ≠ ${b}`);

before(async () => {
  const unit = await prisma.unit.create({ data: { name: `KPI Teste ${TAG}`, code: `KPI_${TAG}` } });
  unitId = unit.id;
  const rec = await prisma.department.create({ data: { name: "Recepção", unitId } });
  const gov = await prisma.department.create({ data: { name: "Governança", unitId } });
  const pRec = await prisma.position.findUniqueOrThrow({ where: { title: "Recepcionista" } });
  const pCam = await prisma.position.findUniqueOrThrow({ where: { title: "Camareira" } });
  const m1 = await prisma.manager.create({ data: { name: `Gestor Um ${TAG}`, email: `g1.${TAG.toLowerCase()}@rialehoteis.com.br`, internalId: `K1-${TAG}`, positionId: pRec.id, departmentId: rec.id } });
  const m2 = await prisma.manager.create({ data: { name: `Gestora Dois ${TAG}`, email: `g2.${TAG.toLowerCase()}@rialehoteis.com.br`, internalId: `K2-${TAG}`, positionId: pCam.id, departmentId: gov.id } });
  const j1 = await prisma.jobOpening.create({ data: { code: `KPI-${TAG}-1`, positionId: pRec.id, departmentId: rec.id, requestingManagerId: m1.id, headcount: 1, status: "PREENCHIDA", openedAt: T("2026-03-02T10:00"), closedAt: T("2026-03-16T08:00") } });
  const j2 = await prisma.jobOpening.create({ data: { code: `KPI-${TAG}-2`, positionId: pCam.id, departmentId: gov.id, requestingManagerId: m2.id, headcount: 2, status: "ABERTA", openedAt: T("2026-03-05T12:00") } });
  const reason = await prisma.rejectionReason.findUniqueOrThrow({ where: { code: "EXPERIENCIA" } });

  type Plan = { k: string; job: string; at: string; who: string; result: "APROVADO" | "REPROVADO" | "NAO_COMPARECEU" | "DESISTIU" | "PENDENTE"; resultAt?: string; canceled?: boolean; status: string; created: string; approvedAt?: string; hiredAt?: string; review?: { req: string; dec?: string; st: "APROVADO" | "REPROVADO" | "PENDENTE"; mgr: string } };
  const plans: Plan[] = [
    { k: "A1", job: j1.id, at: "2026-03-04T09:00", who: "Sara", result: "APROVADO", resultAt: "2026-03-04T12:00", status: "CONTRATADO", created: "2026-03-03T10:00", approvedAt: "2026-03-06T12:00", hiredAt: "2026-03-16T08:00", review: { req: "2026-03-04T12:00", dec: "2026-03-06T12:00", st: "APROVADO", mgr: m1.id } },
    { k: "A2", job: j1.id, at: "2026-03-04T10:00", who: "Sara", result: "REPROVADO", resultAt: "2026-03-04T12:00", status: "REPROVADO", created: "2026-03-03T10:00" },
    { k: "A3", job: j1.id, at: "2026-03-05T09:00", who: "Tati", result: "NAO_COMPARECEU", status: "NAO_COMPARECEU", created: "2026-03-03T11:00" },
    { k: "A4", job: j2.id, at: "2026-03-10T09:00", who: "Tati", result: "APROVADO", resultAt: "2026-03-11T09:00", status: "REPROVADO", created: "2026-03-06T10:00", review: { req: "2026-03-11T09:00", dec: "2026-03-12T21:00", st: "REPROVADO", mgr: m2.id } },
    { k: "A5", job: j2.id, at: "2026-03-10T10:00", who: "Tati", result: "DESISTIU", status: "DESISTENTE", created: "2026-03-06T10:00" },
    { k: "A6", job: j2.id, at: "2026-03-20T09:00", who: "Sara", result: "APROVADO", resultAt: "2026-03-20T15:00", status: "AGUARDANDO_GESTOR", created: "2026-03-18T10:00", review: { req: "2026-03-20T15:00", st: "PENDENTE", mgr: m2.id } },
    { k: "A7", job: j2.id, at: "2026-03-25T09:00", who: "Sara", result: "PENDENTE", status: "ENTREVISTA", created: "2026-03-20T10:00" },
    { k: "A8", job: j1.id, at: "2026-03-26T09:00", who: "Sara", result: "PENDENTE", canceled: true, status: "TRIAGEM", created: "2026-03-21T10:00" },
    { k: "A9", job: j2.id, at: "2026-04-02T09:00", who: "Tati", result: "APROVADO", resultAt: "2026-04-02T10:00", status: "AGUARDANDO_GESTOR", created: "2026-04-01T10:00" },
  ];
  for (const p of plans) {
    const c = await prisma.candidate.create({ data: { fullName: `Kpi ${p.k} ${TAG}`, nameNormalized: `kpi ${p.k.toLowerCase()} ${TAG.toLowerCase()}`, phone: "21999990000", createdAt: T(p.created) } });
    const a = await prisma.application.create({ data: { candidateId: c.id, jobOpeningId: p.job, status: p.status as never, approvedAt: p.approvedAt ? T(p.approvedAt) : null, hiredAt: p.hiredAt ? T(p.hiredAt) : null } });
    await prisma.interview.create({
      data: {
        applicationId: a.id, scheduledAt: T(p.at), interviewerName: `${p.who} ${TAG}`, result: p.result, resultAt: p.resultAt ? T(p.resultAt) : null,
        status: p.canceled ? "CANCELADA" : p.result === "NAO_COMPARECEU" ? "NAO_COMPARECEU" : p.result === "PENDENTE" ? "AGENDADA" : "REALIZADA",
        reasonId: p.result === "REPROVADO" ? reason.id : null,
      },
    });
    if (p.review) await prisma.managerReview.create({ data: { applicationId: a.id, managerId: p.review.mgr, status: p.review.st, requestedAt: T(p.review.req), decidedAt: p.review.dec ? T(p.review.dec) : null, justification: p.review.st === "REPROVADO" ? "teste" : null } });
    ids[p.k] = a.id;
  }
  ids = { ...ids, j1: j1.id, j2: j2.id, pRec: pRec.id, pCam: pCam.id };

  // Metas: padrão 3 d; Camareira 5 d; Recepcionista + Recepção 1,5 d (mais específica vence)
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  for (const t of [
    { stage: "ABERTURA_PRIMEIRA_ENTREVISTA", targetDays: 3 },
    { stage: "ABERTURA_PRIMEIRA_ENTREVISTA", positionId: pCam.id, targetDays: 5 },
    { stage: "ABERTURA_PRIMEIRA_ENTREVISTA", positionId: pRec.id, departmentName: "Recepção", targetDays: 1.5 },
    { stage: "APROVACAO_RH_GESTOR", targetDays: 1.8 },
  ]) {
    const existing = await prisma.slaTarget.findFirst({ where: { stage: t.stage as never, positionId: t.positionId ?? null, departmentName: t.departmentName ?? null } });
    if (!existing) targetIds.push((await saveTarget(rh, t)).id);
    else await saveTarget(rh, t);
  }
});

after(async () => {
  await prisma.slaTarget.deleteMany({ where: { id: { in: targetIds } } });
  await prisma.$disconnect();
});

const report = async (extra: Record<string, string> = {}) => buildReport(await asUser(prisma, "rh@rialehoteis.com.br"), { gran: "mes", ref: "2026-03-15", unidade: unitId, ...extra });

test("Recrutamento: contagens de março conferem com os registros", async () => {
  const c = (await report()).counts;
  assert.equal(c.vagasAbertasAgora, 1); // J2
  assert.equal(c.vagasAbertasNoPeriodo, 2);
  assert.equal(c.vagasEncerradas, 1); // J1 preenchida em 16/03
  assert.equal(c.candidatosCadastrados, 8); // A1..A8 (A9 é de abril)
  assert.equal(c.entrevistasAgendadas, 7); // A8 cancelada não conta
  assert.equal(c.entrevistasRealizadas, 5); // A1 A2 A4 A5 A6
  assert.equal(c.faltas, 1); // A3
  assert.equal(c.desistencias, 1); // A5
  assert.equal(c.aprovacoesRH, 3); // A1 A4 A6
  assert.equal(c.reprovacoesRH, 1); // A2
  assert.equal(c.semResultado, 1); // A7
  assert.equal(c.aprovacoesGestor, 1); // A1
  assert.equal(c.reprovacoesGestor, 1); // A4
  assert.equal(c.pendentesGestorAgora, 1); // A6
  assert.equal(c.contratacoes, 1); // A1
});

test("Conversão: taxas, denominadores e exclusões", async () => {
  const v = (await report()).conversion;
  assert.deepEqual([v.comparecimento.num, v.comparecimento.den], [4, 5]); // compareceram A1 A2 A4 A6; faltou A3
  close(v.comparecimento.value, 0.8);
  assert.equal(v.comparecimento.excluded?.["desistências (presença incerta)"], 1);
  assert.equal(v.comparecimento.excluded?.["sem resultado registrado"], 1);
  assert.deepEqual([v.aprovacaoRH.num, v.aprovacaoRH.den], [3, 4]); // A1 A4 A6 ÷ (+A2)
  assert.deepEqual([v.aprovacaoGestor.num, v.aprovacaoGestor.den], [1, 2]);
  assert.deepEqual([v.contratacao.num, v.contratacao.den], [1, 4]); // A1 ÷ (A1 A2 A4 A6)
  assert.equal(v.contratacao.excluded?.["ainda em processo (coorte não concluída)"], 1); // A6
  assert.deepEqual([v.desistencia.num, v.desistencia.den], [1, 5]);
  assert.equal(v.cohortSize, 7); // A8 só teve entrevista cancelada; A9 é de abril
});

test("Produtividade: por recrutadora, departamento, contratação e tempo do gestor", async () => {
  const r = await report();
  const sara = r.byRecruiter.find((x) => x.label === `Sara ${TAG}`)!;
  const tati = r.byRecruiter.find((x) => x.label === `Tati ${TAG}`)!;
  assert.deepEqual([sara.agendadas, sara.realizadas, sara.faltas, sara.aprovadasRH], [4, 3, 0, 2]);
  assert.deepEqual([tati.agendadas, tati.realizadas, tati.faltas, tati.aprovadasRH], [3, 2, 1, 1]);
  assert.equal(r.byDepartment.find((x) => x.label === "Recepção")?.agendadas, 3);
  assert.equal(r.byDepartment.find((x) => x.label === "Governança")?.agendadas, 4);
  assert.deepEqual(r.hiresByRecruiter, [{ label: `Sara ${TAG}`, value: 1 }]);
  const g1 = r.managerTime.find((m) => m.label === `Gestor Um ${TAG}`)!;
  const g2 = r.managerTime.find((m) => m.label === `Gestora Dois ${TAG}`)!;
  assert.equal(g1.n, 1); close(g1.mean, 2); // 04/03 12h → 06/03 12h
  assert.equal(g2.n, 1); close(g2.mean, 1.5); // 11/03 09h → 12/03 21h
  assert.equal(g2.pending, 1);
});

test("SLA: cada etapa medida separadamente, com metas por cargo/departamento", async () => {
  const sla = Object.fromEntries((await report()).sla.map((s) => [s.stage, s]));
  const s1 = sla.ABERTURA_PRIMEIRA_ENTREVISTA;
  assert.equal(s1.n, 2);
  close(s1.mean, (23 / 24 + 1 + (4 + 21 / 24)) / 2); // J1: 1,9583 d · J2: 4,875 d
  assert.deepEqual([s1.withinTarget.num, s1.withinTarget.den], [1, 2]); // J1 > 1,5 (meta específica); J2 ≤ 5 (meta do cargo)
  const s2 = sla.ENTREVISTA_APROVACAO_RH;
  assert.equal(s2.n, 3);
  close(s2.mean, (3 / 24 + 1 + 6 / 24) / 3); // A1 3h · A4 24h · A6 6h
  const s3 = sla.APROVACAO_RH_GESTOR;
  assert.equal(s3.n, 2);
  close(s3.mean, 1.75);
  assert.deepEqual([s3.withinTarget.num, s3.withinTarget.den], [1, 2]); // 1,5 ≤ 1,8; 2,0 > 1,8
  assert.equal(s3.openNow.filter((o) => o.label.includes(TAG)).length, 1); // A6 aguardando
  close(sla.APROVACAO_ADMISSAO.mean, 9 + 20 / 24); // 06/03 12h → 16/03 08h
  close(sla.ABERTURA_CONTRATACAO.mean, 13 + 22 / 24); // 02/03 10h → 16/03 08h
  // tempos do RH e do gestor não se misturam: a soma das etapas 2 e 3 não é usada em nenhuma etapa do RH
  assert.ok(s2.mean! < 1 && s3.mean! > 1);
});

test("Filtros e períodos: recrutadora, departamento, abril e tendência", async () => {
  assert.equal((await report({ recrutadora: `Tati ${TAG}` })).counts.entrevistasAgendadas, 3);
  assert.equal((await report({ departamento: "Governança" })).counts.entrevistasAgendadas, 4);
  assert.equal((await report({ cargo: ids.pRec })).counts.entrevistasAgendadas, 3);
  const apr = await report({ ref: "2026-04-10" });
  assert.equal(apr.counts.entrevistasAgendadas, 1);
  assert.equal(apr.counts.candidatosCadastrados, 1);
  const tri = await report({ gran: "trimestre", ref: "2026-02-01" }); // 1º tri: só março tem dados
  assert.equal(tri.counts.entrevistasAgendadas, 7);
  const trend = (await report()).trend;
  assert.equal(trend.length, 12);
  assert.equal(trend.at(-1)!.agendadas, 7);
  assert.equal(trend.at(-2)!.agendadas, 0); // fevereiro
  const week = await report({ gran: "semana", ref: "2026-03-04" }); // 02–08/03
  assert.equal(week.counts.entrevistasAgendadas, 3); // A1 A2 A3
});

test("Sem observações: taxas ficam vazias (—), nunca zero", async () => {
  const empty = await report({ ref: "2025-06-15" });
  assert.equal(empty.conversion.aprovacaoRH.value, null);
  assert.equal(empty.conversion.aprovacaoRH.den, 0);
  assert.equal(empty.sla[0].mean, null);
});

test("Exportação: Excel com fórmulas, validação e metodologia; PDF válido", async () => {
  const r = await report();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await reportToXlsx(r)) as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Resumo", "Conversão", "Produtividade", "SLA", "Base_Entrevistas", "Validação", "Metodologia"]);
  assert.equal(wb.getWorksheet("Resumo")!.getCell("B9").value, 7); // entrevistas agendadas
  const conv = wb.getWorksheet("Conversão")!;
  assert.match(String((conv.getCell("D5").value as { formula: string }).formula), /B5\/C5/);
  assert.deepEqual([conv.getCell("B5").value, conv.getCell("C5").value], [4, 5]);
  const base = wb.getWorksheet("Base_Entrevistas")!;
  assert.equal(base.rowCount - 1, 8); // 8 entrevistas de março (inclui a cancelada, marcada como tal)
  const pdf = await reportToPdf(r);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 2000);
});

test("Contratação pelo módulo de admissão alimenta os indicadores (contratações e SLA aprovação → admissão)", async () => {
  const { forwardToAdmission, updateAdmission, scheduleExam, updateExam, confirmAdmission } = await import("../../src/modules/admission/service");
  const { saveClinic } = await import("../../src/modules/admission/config");
  const { approveAllDocs, fakeCpf } = await import("../../prisma/demo-admission");
  const { addDays, todayKey, localToDate } = await import("../../src/lib/datetime");
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const today = todayKey();
  const dept = await prisma.department.findFirstOrThrow({ where: { unitId, name: "Recepção" } });
  const job = await prisma.jobOpening.create({ data: { code: `KPI-${TAG}-3`, positionId: ids.pRec, departmentId: dept.id, headcount: 1, status: "ABERTA", openedAt: localToDate(addDays(today, -20)) } });
  const c = await prisma.candidate.create({ data: { fullName: `Kpi H ${TAG}`, nameNormalized: `kpi h ${TAG.toLowerCase()}`, phone: "21999990000" } });
  const app = await prisma.application.create({ data: { candidateId: c.id, jobOpeningId: job.id, status: "APROVADO", approvedAt: localToDate(addDays(today, -5), "10:00") } });
  const adm = await forwardToAdmission(rh, app.id);
  await updateAdmission(rh, adm.id, { admissionDate: today, cpf: fakeCpf(Number(Date.now().toString().slice(-7)) + 77), salary: "2000", schedule: "SEIS_POR_UM", managerId: (await prisma.manager.findFirstOrThrow({ where: { departmentId: dept.id } })).id });
  await approveAllDocs(prisma, rh.email, adm.id);
  const clinic = await saveClinic(rh, { name: `Clínica KPI ${TAG}` });
  const ex = await scheduleExam(rh, adm.id, { clinicId: clinic.id, date: addDays(today, -1), time: "08:00" });
  await updateExam(rh, ex.id, { action: "realizado", date: addDays(today, -1) });
  await updateExam(rh, ex.id, { action: "aso", date: today, result: "APTO" });
  await confirmAdmission(rh, adm.id);
  assert.equal((await prisma.jobOpening.findUniqueOrThrow({ where: { id: job.id } })).status, "PREENCHIDA");
  const now = await report({ ref: today });
  assert.equal(now.counts.contratacoes, 1);
  close(now.sla.find((s) => s.stage === "APROVACAO_ADMISSAO")!.mean, 4 + 22 / 24); // D-5 10h → D 08h
});
