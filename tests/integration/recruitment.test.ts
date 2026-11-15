/**
 * Fase 2 — recrutamento e seleção contra o PostgreSQL real (requer seed com SEED_DEMO=true).
 * Simula 24 candidatos pelo fluxo completo e testa regras, escopo, histórico e importação.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { prisma } from "../../src/lib/prisma";
import { simulateRecruitment, asUser } from "../../prisma/demo-recruitment";
import { createCandidate, DuplicateCandidateError, listCandidates } from "../../src/modules/recruitment/candidates";
import { createJob, listJobs } from "../../src/modules/recruitment/jobs";
import { decideReview, registerResult, scheduleInterviews } from "../../src/modules/recruitment/workflow";
import { analyze, batchReportCsv, commitImport, getBatch, uploadSpreadsheet } from "../../src/modules/import/service";
import { ForbiddenError, toPublicError } from "../../src/modules/shared/errors";
import { addDays, todayKey } from "../../src/lib/datetime";

const TAG = Date.now().toString(36).toUpperCase();
const status = (e: unknown) => toPublicError(e).status;
after(() => prisma.$disconnect());

let sim: { jobs: string[]; candidates: string[] };

test("Simulação: 24 candidatos, 6 vagas, 3 unidades, fluxo RH → gestor completo", async () => {
  sim = await simulateRecruitment(prisma, { tag: TAG });
  assert.equal(sim.candidates.length, 24);
  const apps = await prisma.application.findMany({ where: { candidateId: { in: sim.candidates } }, include: { jobOpening: { include: { department: { include: { unit: true } } } } } });
  const units = new Set(apps.map((a) => a.jobOpening.department.unit.code));
  assert.deepEqual([...units].sort(), ["BRISA", "IMPERIAL", "VILAMAR"]);
  const by = (s: string) => apps.filter((a) => a.status === s).length;
  assert.equal(by("APROVADO"), 3, "aprovados RH+gestor (+externa quando houver)");
  assert.equal(by("REPROVADO"), 10, "reprovados RH, gestor ou avaliação externa");
  assert.equal(by("AGUARDANDO_GESTOR"), 1);
  assert.equal(by("AVALIACAO"), 1);
  assert.equal(by("DESISTENTE"), 2);
  assert.equal(by("NAO_COMPARECEU"), 1);
  assert.equal(by("ENTREVISTA"), 6, "futuras, pendentes e 'nova entrevista' solicitada pelo gestor");
  assert.equal(apps.length, 24, "3 + 10 + 1 + 1 + 2 + 1 + 6 = 24");
  // códigos automáticos e únicos
  const jobs = await prisma.jobOpening.findMany({ where: { id: { in: sim.jobs } } });
  assert.ok(jobs.every((j) => /^VAG-\d{4}-\d{4}$/.test(j.code)));
  assert.equal(new Set(jobs.map((j) => j.code)).size, 6);
});

test("Resultado do RH e decisão do gestor ficam separados; decisões em nome do gestor são marcadas", async () => {
  const reviews = await prisma.managerReview.findMany({ where: { application: { candidateId: { in: sim.candidates } } } });
  assert.equal(reviews.length, 9, "um encaminhamento por aprovação do RH");
  assert.ok(reviews.filter((r) => r.status !== "PENDENTE" && r.onBehalf).length >= 4);
  const rejected = reviews.find((r) => r.status === "REPROVADO");
  assert.ok(rejected?.justification, "reprovação do gestor tem justificativa");
  const ivs = await prisma.interview.findMany({ where: { application: { candidateId: { in: sim.candidates } }, result: "REPROVADO" } });
  assert.ok(ivs.every((i) => i.reasonId), "toda reprovação do RH tem motivo");
  const notif = await prisma.notification.count({ where: { template: "recrutamento.avaliacao_gestor", createdAt: { gte: new Date(Date.now() - 600_000) } } });
  assert.ok(notif >= 9, "gestor avisado por e-mail (fila)");
});

test("Histórico registra cada etapa e é imutável", async () => {
  const events = await prisma.candidateEvent.findMany({ where: { candidateId: sim.candidates[0] }, orderBy: { createdAt: "asc" } });
  const types = events.map((e) => e.type);
  for (const t of ["CADASTRO", "CANDIDATURA", "ENTREVISTA_AGENDADA", "RESULTADO_RH", "ENCAMINHADO_GESTOR", "DECISAO_GESTOR", "AVALIACAO_EXTERNA"]) assert.ok(types.includes(t as never), t);
  assert.ok(events.every((e) => e.actorUserId), "responsável por cada etapa");
  await assert.rejects(prisma.candidateEvent.update({ where: { id: events[0].id }, data: { summary: "x" } }), /somente inserção/);
});

test("Duplicidade: mesmo telefone é detectado; RH escolhe usar o existente ou confirmar novo", async () => {
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const first = await prisma.candidate.findUniqueOrThrow({ where: { id: sim.candidates[0] } });
  const err = await createCandidate(rh, { fullName: "Outra Pessoa Qualquer", phone: first.phone!, jobOpeningId: sim.jobs[1] }).catch((e) => e);
  assert.ok(err instanceof DuplicateCandidateError);
  assert.ok(err.matches.some((m: { id: string; reason: string }) => m.id === first.id && m.reason.includes("telefone")));
  const reused = await createCandidate(rh, { fullName: first.fullName, phone: first.phone!, jobOpeningId: sim.jobs[1], useExistingId: first.id });
  assert.equal(reused.reused, true);
  assert.equal(await prisma.application.count({ where: { candidateId: first.id } }), 2, "vinculado à segunda vaga sem novo cadastro");
  const similar = await createCandidate(rh, { fullName: first.fullName, phone: "21970000000" }).catch((e) => e);
  assert.ok(similar instanceof DuplicateCandidateError, "nome igual também alerta");
  const forced = await createCandidate(rh, { fullName: first.fullName, phone: "21970000000", confirmNew: true });
  assert.equal(forced.reused, false);
});

test("Regras do resultado: reprovação exige motivo; 'Outro' exige observação; gestor só decide o que é dele", async () => {
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const marina = await asUser(prisma, "marina.souza@rialehoteis.com.br");
  const { candidate } = await createCandidate(rh, { fullName: `Teste Regras ${TAG}`, phone: "21960000001", jobOpeningId: sim.jobs[0], confirmNew: true });
  const [iv] = await scheduleInterviews(rh, { jobOpeningId: sim.jobs[0], candidateIds: [candidate.id], date: addDays(todayKey(), -1), time: "10:00" });
  assert.equal(status(await registerResult(rh, iv.id, { result: "REPROVADO" }).catch((e) => e)), 422);
  const outro = await prisma.rejectionReason.findUniqueOrThrow({ where: { code: "OUTRO" } });
  assert.equal(status(await registerResult(rh, iv.id, { result: "REPROVADO", reasonId: outro.id }).catch((e) => e)), 422);
  await assert.rejects(registerResult(marina, iv.id, { result: "APROVADO" }), (e) => e instanceof ForbiddenError, "gestor não registra resultado do RH");

  await registerResult(rh, iv.id, { result: "APROVADO" });
  const review = await prisma.managerReview.findFirstOrThrow({ where: { application: { candidateId: candidate.id } } });
  assert.equal(status(await decideReview(marina, review.id, { decision: "REPROVADO" }).catch((e) => e)), 422, "justificativa obrigatória");
  assert.equal(status(await decideReview(rh, review.id, { decision: "APROVADO" }).catch((e) => e)), 422, "RH em nome do gestor precisa justificar");

  // Marina não decide vagas de outro gestor
  const other = await prisma.managerReview.findFirst({ where: { status: "PENDENTE", managerId: { not: marina.managerId } } });
  if (other) assert.equal(status(await decideReview(marina, other.id, { decision: "APROVADO" }).catch((e) => e)), 404);
  await decideReview(marina, review.id, { decision: "APROVADO", justification: "ok" });
  const app = await prisma.application.findFirstOrThrow({ where: { candidateId: candidate.id } });
  assert.equal(app.status, "APROVADO");
});

test("Escopo: gestor vê só as próprias vagas; RH de unidade só a sua unidade", async () => {
  const marina = await asUser(prisma, "marina.souza@rialehoteis.com.br");
  const rhBrisa = await asUser(prisma, "rh.brisabarra@rialehoteis.com.br");
  const mJobs = await listJobs(marina, { status: "todas", includeHistorical: true });
  assert.ok(mJobs.length > 0 && mJobs.every((j) => j.requestingManager?.id === marina.managerId || j.department.name === "Recepção"));
  const bJobs = await listJobs(rhBrisa, { status: "todas" });
  assert.ok(bJobs.every((j) => j.department.unit.name === "Brisa Barra"));
  const imperial = await prisma.unit.findUniqueOrThrow({ where: { code: "IMPERIAL" } });
  const dept = await prisma.department.findFirstOrThrow({ where: { unitId: imperial.id } });
  const pos = await prisma.position.findFirstOrThrow();
  assert.equal(status(await createJob(rhBrisa, { positionId: pos.id, departmentId: dept.id }).catch((e) => e)), 403);
  const cands = await listCandidates(marina, {});
  assert.ok(cands.rows.length > 0 && cands.rows.every((c) => c.applications.some((a) => mJobs.some((j) => j.id === a.jobOpening.id))));
});

async function fixtureXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Página1");
  ws.addRow(["Unidade", "Data entrevista", "Candidato", "Vaga", "Recrutador", "Aprovado pelo RH?", "Motivo"]);
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const rows: unknown[][] = [
    ["Brisa Barra ", d("2026-09-14"), `Joana Prado ${TAG}`, "Assistente de Hospedagem ", "Sara Rolim", "Sim / Reprovado Aginco", null],
    ["Brisa Barra", d("2026-09-15"), `Marcos Tavares ${TAG}`, "Ass. Governança", "Tatiana / Sara ", "Sim", "Aprovado - AGINCO"],
    ["Vilamar ", d("2026-09-16"), `Rita Campos ${TAG}`, "garçom", "Tatiana", "Não", "Não aderente a cultura da empresa"],
    ["Vilamar", d("2026-09-16"), `Rita Campos ${TAG}`, "Garçom", "Tatiana", "Não", "Não aderente a cultura da empresa"], // duplicada
    ["Imperial", d("2026-09-17"), `Paulo Sena ${TAG}`, "Cozinheiro", "Sara Rolim", "Não aceitou salario", "Está ganhando atualmente R$ 2.600,00 no hotel X"],
    ["Imperial", d("2026-09-21"), `Paulo Sena ${TAG} 2º etapa`, "II Cozinheiro", "Sara/Chefe", "Sim RH /Não gestor", "Gestor informou que não possui conhecimento"],
    ["Imperial", d("2026-09-22"), `Nina ${TAG}`, "RM", "Sara/ Aline", "Banco de Talentos", null],
    ["Copacabana", d("2026-09-23"), `Leo Dias ${TAG}`, "Mensageiro", "Sara", "Sim", null], // unidade inexistente
    ["Imperial", "31/02/2026", `Bia Lopes ${TAG}`, "Barman", "Sara", "Reprovado", null], // data inválida
    ["Brisa Barra", d("2026-09-24"), `Caio Brito ${TAG}`, "Chefe de Fila", "Sara Rolim", "Analisar com Eduardo (Pretensão Salarial)", null],
  ];
  for (const r of rows) ws.addRow(r);
  ws.addRow([]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("Importação: colunas, grafias, duplicidades e inconsistências antes de gravar; nada some sem motivo", async () => {
  const rh = await asUser(prisma, "rh@rialehoteis.com.br");
  const buf = await fixtureXlsx();
  const batch = await uploadSpreadsheet(rh, new File([new Uint8Array(buf)], `planilha-${TAG}.xlsx`));
  let b = await getBatch(rh, batch.id);
  assert.equal(b.totalRows, 10, "linha vazia não conta");
  const st = (n: number) => b.rows.find((r) => r.rowNumber === n)!;
  assert.equal(st(5).status, "DUPLICADO_ARQUIVO");
  assert.match(st(5).ignoreReason ?? "", /linha 4/);
  assert.equal(st(9).status, "INCONSISTENTE");
  assert.ok(st(9).issues.some((i) => i.includes("Unidade não identificada")));
  assert.equal(st(10).status, "INCONSISTENTE");
  assert.ok(st(10).issues.some((i) => i.includes("Data inválida")));
  const n = (r: number) => st(r).normalized as { outcome: string; positionTitle: string; stage: number | null; lastSalary?: number };
  assert.equal(n(2).outcome, "APROVADO_EXTERNA_REPROVADA");
  assert.equal(n(3).outcome, "APROVADO_EXTERNA_APROVADA");
  assert.equal(n(3).positionTitle, "Assistente de Governança");
  assert.equal(n(7).stage, 2);
  assert.equal(n(7).positionTitle, "Cozinheiro II");
  assert.equal(n(6).lastSalary, 2600);
  assert.equal(n(8).positionTitle, "Revenue Manager");

  const r = await commitImport(rh, batch.id);
  assert.equal(r.imported, 7);
  assert.equal(r.ignored, 3);
  b = await getBatch(rh, batch.id);
  assert.ok(b.rows.filter((x) => x.status !== "IMPORTADO").every((x) => x.ignoreReason), "toda linha não importada tem motivo");
  const paulo = await prisma.candidate.findFirstOrThrow({ where: { nameNormalized: `paulo sena ${TAG.toLowerCase()}` }, include: { applications: { include: { interviews: true, managerReviews: true } } } });
  assert.equal(paulo.applications.flatMap((a) => a.interviews).length, 2, "2ª etapa ligada ao mesmo candidato");
  assert.ok(paulo.applications.some((a) => a.managerReviews.some((m) => m.status === "REPROVADO" && m.justification)));
  const csv = await batchReportCsv(rh, batch.id);
  assert.equal(csv.trim().split(/\r\n/).length, 11, "cabeçalho + 10 linhas no relatório");

  // Reimportar o mesmo arquivo: nada é duplicado
  const again = await uploadSpreadsheet(rh, new File([new Uint8Array(buf)], `planilha-${TAG}.xlsx`));
  await analyze(rh, again.id);
  const b2 = await getBatch(rh, again.id);
  assert.ok((b2.summary as { aviso?: string }).aviso?.includes("já foi importado"));
  const importable = b2.rows.filter((x) => x.decision !== "IGNORAR");
  assert.equal(importable.length, 0, "linhas já importadas são identificadas e ignoradas com motivo");
});
