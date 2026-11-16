/**
 * Fase 5 — admissão e ciclo inicial contra o PostgreSQL real (requer seed com SEED_DEMO=true).
 * Cria uma unidade isolada e simula: encaminhamento, documentação pendente/recusada, anexos com
 * acesso restrito, exame (falta, remarcação, ASO inapto/apto), confirmação (conversão em colaborador
 * com histórico preservado), marcos 30/45/90, alertas ao RH, desligamentos e indicadores de permanência.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { asUser } from "../../prisma/demo-recruitment";
import { approveAllDocs, fakeCpf } from "../../prisma/demo-admission";
import { addDays, dateKey, localToDate, todayKey } from "../../src/lib/datetime";
import { attachAdmissionFile, readiness, cancelAdmission, confirmAdmission, forwardToAdmission, getAdmission, readyForAdmission, scheduleExam, setDocumentStatus, updateAdmission, updateExam } from "../../src/modules/admission/service";
import { saveClinic, saveDocType } from "../../src/modules/admission/config";
import { createDirectEmployee, getEmployee, listEmployees, recordMilestone, terminateEmployee } from "../../src/modules/people/service";
import { probationAlerts } from "../../src/modules/people/alerts";
import { buildPermanence } from "../../src/modules/people/report";
import { readDocument } from "../../src/modules/documents/service";
import { milestoneDate } from "../../src/modules/people/rules";
import { toPublicError } from "../../src/modules/shared/errors";

const TAG = Date.now().toString(36).toUpperCase().slice(-6);
const SEED = Number(Date.now().toString().slice(-7));
const status = (e: unknown) => toPublicError(e).status;
const today = todayKey();
type U = Awaited<ReturnType<typeof asUser>>;
let rh: U, rhBrisa: U, gestor: U, admin: U;
let unitId = "", deptId = "", jobId = "", clinicId = "", posId = "", mgrId = "";
const apps: string[] = [];
const cands: string[] = [];

async function approvedApplication(k: string, approvedAgo = 1) {
  const c = await prisma.candidate.create({ data: { fullName: `Adm ${k} ${TAG}`, nameNormalized: `adm ${k.toLowerCase()} ${TAG.toLowerCase()}`, phone: "21988887777" } });
  const a = await prisma.application.create({ data: { candidateId: c.id, jobOpeningId: jobId, status: "APROVADO", approvedAt: localToDate(addDays(today, -approvedAgo), "10:00"), offeredSalary: 2300 } });
  const iv = await prisma.interview.create({ data: { applicationId: a.id, scheduledAt: localToDate(addDays(today, -5), "09:00"), interviewerName: `Recrutadora ${TAG}`, status: "REALIZADA", result: "APROVADO", resultAt: localToDate(addDays(today, -5), "10:00") } });
  await prisma.managerReview.create({ data: { applicationId: a.id, managerId: mgrId, status: "APROVADO", requestedAt: localToDate(addDays(today, -5), "10:00"), decidedAt: localToDate(addDays(today, -approvedAgo), "10:00") } });
  await prisma.candidateEvent.createMany({ data: [
    { candidateId: c.id, applicationId: a.id, type: "RESULTADO_RH", summary: "Aprovado pelo RH", interviewId: iv.id },
    { candidateId: c.id, applicationId: a.id, type: "DECISAO_GESTOR", summary: "Aprovado pelo gestor" },
  ] });
  apps.push(a.id); cands.push(c.id);
  return { candidateId: c.id, applicationId: a.id, interviewId: iv.id };
}

before(async () => {
  [rh, rhBrisa, gestor, admin] = await Promise.all(["rh@rialehoteis.com.br", "rh.brisabarra@rialehoteis.com.br", "marina.souza@rialehoteis.com.br", "admin@rialehoteis.com.br"].map((e) => asUser(prisma, e)));
  const unit = await prisma.unit.create({ data: { name: `Adm Teste ${TAG}`, code: `ADM_${TAG}` } });
  unitId = unit.id;
  deptId = (await prisma.department.create({ data: { name: "Recepção", unitId } })).id;
  posId = (await prisma.position.findUniqueOrThrow({ where: { title: "Recepcionista" } })).id;
  mgrId = (await prisma.manager.create({ data: { name: `Gestora Adm ${TAG}`, email: `ga.${TAG.toLowerCase()}@rialehoteis.com.br`, internalId: `GA-${TAG}`, positionId: posId, departmentId: deptId } })).id;
  jobId = (await prisma.jobOpening.create({ data: { code: `ADM-${TAG}`, positionId: posId, departmentId: deptId, requestingManagerId: mgrId, headcount: 1, status: "ABERTA", openedAt: localToDate(addDays(today, -20)), expectedSalary: 2150, schedule: "DOZE_POR_TRINTA_E_SEIS", shift: "NOTURNO", weeklyHours: 36 } })).id;
  clinicId = (await saveClinic(rh, { name: `Clínica Teste ${TAG}` })).id;
});
after(() => prisma.$disconnect());

let A = { candidateId: "", applicationId: "", interviewId: "" };
let admId = "";
let empId = "";

test("Encaminhamento: só com aprovação final; pré-preenche com a vaga e cria o checklist vigente", async () => {
  A = await approvedApplication("A");
  const notApproved = await prisma.application.create({ data: { candidateId: (await prisma.candidate.create({ data: { fullName: `Adm X ${TAG}`, nameNormalized: `adm x ${TAG.toLowerCase()}` } })).id, jobOpeningId: jobId, status: "AGUARDANDO_GESTOR" } });
  await assert.rejects(forwardToAdmission(rh, notApproved.id), /aprovação em todas as etapas/);
  assert.ok((await readyForAdmission(rh)).some((a) => a.id === A.applicationId));
  await assert.rejects(forwardToAdmission(gestor, A.applicationId), (e) => status(e) === 403);
  const adm = await forwardToAdmission(rh, A.applicationId);
  admId = adm.id;
  assert.match(adm.code, /^ADM-\d{4}-\d{4}$/);
  assert.equal(Number(adm.salary), 2300); // oferta negociada tem precedência sobre o salário previsto da vaga
  assert.equal(adm.schedule, "DOZE_POR_TRINTA_E_SEIS");
  assert.equal(adm.managerId, mgrId);
  const types = await prisma.admissionDocType.count({ where: { active: true } });
  assert.equal(await prisma.admissionDocument.count({ where: { admissionId: admId } }), types);
  await assert.rejects(forwardToAdmission(rh, A.applicationId), /Já existe o processo/);
  assert.ok(!(await readyForAdmission(rh)).some((a) => a.id === A.applicationId));
});

test("Documentação pendente bloqueia a contratação; condição de dependentes; recusa exige motivo", async () => {
  await assert.rejects(confirmAdmission(rh, admId), /Faltam/);
  let a = await getAdmission(rh, admId);
  assert.ok(a.missing.includes("CPF do candidato"));
  assert.ok(a.missing.includes("Data de admissão"));
  assert.ok(a.missing.some((m) => m.startsWith("Documento: Carteira de Trabalho Digital")));
  assert.ok(!a.missing.some((m) => m.includes("dependentes")), "sem dependentes, documentos de dependentes não são exigidos");
  await updateAdmission(rh, admId, { hasDependents: "true" });
  a = await getAdmission(rh, admId);
  assert.ok(a.missing.some((m) => m.includes("Certidão de nascimento dos dependentes")));
  assert.ok(!a.missing.some((m) => m.includes("Caderneta de vacinação")), "opcional não bloqueia");
  const ctps = a.documents.find((d) => d.docType.code === "CTPS_DIGITAL")!;
  await assert.rejects(setDocumentStatus(rh, ctps.id, { status: "RECUSADO" }), /motivo da recusa/);
  await setDocumentStatus(rh, ctps.id, { status: "RECUSADO", refusalReason: "Página de qualificação ilegível" });
  await setDocumentStatus(rh, ctps.id, { status: "EM_ANALISE" });
  // item novo no checklist entra no processo em andamento
  const extra = await saveDocType(rh, { label: `Declaração extra ${TAG}`, category: "OUTROS", required: "true" });
  a = await getAdmission(rh, admId);
  assert.ok(a.documents.some((d) => d.docTypeId === extra.id));
  await saveDocType(rh, { id: extra.id, label: extra.label, category: "OUTROS", required: "false", active: "false" });
});

test("Anexos: cifrados, Pendente → Recebido; acesso restrito por permissão e unidade, com auditoria", async () => {
  const a = await getAdmission(rh, admId);
  const rg = a.documents.find((d) => d.docType.code === "RG_CNH")!;
  const pdf = new File([Buffer.from("%PDF-1.4\n% documento de teste\n")], "rg.pdf", { type: "application/pdf" });
  const stored = await attachAdmissionFile(rh, { documentId: rg.id }, pdf);
  assert.equal(stored.classification, "SENSIVEL");
  assert.equal((await prisma.admissionDocument.findUniqueOrThrow({ where: { id: rg.id } })).status, "RECEBIDO");
  const blob = await prisma.documentBlob.findUniqueOrThrow({ where: { documentId: stored.id } });
  assert.ok(!Buffer.from(blob.data).includes(Buffer.from("documento de teste")), "conteúdo cifrado no banco");
  const ok = await readDocument(rh, stored.id);
  assert.match(ok.data.toString(), /documento de teste/);
  await assert.rejects(readDocument(gestor, stored.id), (e) => status(e) === 403);
  await assert.rejects(readDocument(rhBrisa, stored.id), (e) => status(e) === 404); // RH de outra unidade
  assert.equal(await prisma.auditLog.count({ where: { entityId: stored.id, action: "ACCESS_DENIED" } }), 1);
  assert.ok(await prisma.auditLog.count({ where: { entityId: stored.id, action: "DOCUMENT_DOWNLOAD" } }) >= 1);
  const exe = new File([Buffer.from("MZ executável")], "x.pdf");
  await assert.rejects(attachAdmissionFile(rh, { documentId: rg.id }, exe), /Formato não permitido/);
});

test("Exame admissional: falta, remarcação, ASO só após realização, inapto bloqueia, apto libera", async () => {
  const ex1 = await scheduleExam(rh, admId, { clinicId, date: addDays(today, -3), time: "08:00" });
  await assert.rejects(scheduleExam(rh, admId, { clinicId, date: today, time: "09:00" }), /Já existe exame agendado/);
  await assert.rejects(updateExam(rh, ex1.id, { action: "aso", date: today, result: "APTO" }), /realização do exame antes do ASO/);
  await updateExam(rh, ex1.id, { action: "falta" });
  const ex2 = await scheduleExam(rh, admId, { clinicId, date: addDays(today, -2), time: "08:00" });
  await assert.rejects(updateExam(rh, ex2.id, { action: "realizado", date: addDays(today, 1) }), /futuro/);
  await updateExam(rh, ex2.id, { action: "realizado", date: addDays(today, -2) });
  await assert.rejects(updateExam(rh, ex2.id, { action: "aso", date: addDays(today, -3), result: "APTO" }), /antes do exame/);
  await updateExam(rh, ex2.id, { action: "aso", date: addDays(today, -1), result: "INAPTO" });
  let a = await getAdmission(rh, admId);
  assert.ok(a.missing.some((m) => m.includes("ASO apto")));
  await updateExam(rh, ex2.id, { action: "aso", date: addDays(today, -1), result: "APTO" });
  a = await getAdmission(rh, admId);
  assert.ok(!a.missing.some((m) => m.includes("ASO")));
  assert.deepEqual(a.exams.map((e) => e.status), ["NAO_COMPARECEU", "REALIZADO"]);
});

test("Dados da admissão: datas validadas, CPF único, exame antes do início (NR-7)", async () => {
  await assert.rejects(updateAdmission(rh, admId, { admissionDate: addDays(today, -10) }), /anterior à aprovação final/);
  await assert.rejects(updateAdmission(rh, admId, { cpf: "111.111.111-11" }), /CPF inválido|inválido/);
  await updateAdmission(rh, admId, { admissionDate: addDays(today, -1), cpf: fakeCpf(SEED) });
  const a = await getAdmission(rh, admId);
  assert.match(a.cpfMasked!, /\*\*\*/);
  assert.ok(!a.missing.some((m) => m.includes("NR-7")), "exame em D-2, admissão em D-1: exame antes do início — ok");
  // exame realizado depois da data de admissão → bloqueia (NR-7)
  const late = readiness({ ...a, admissionDate: localToDate(addDays(today, -1)), exams: a.exams.map((e) => ({ ...e, performedAt: e.status === "REALIZADO" ? localToDate(today, "12:00") : e.performedAt })) });
  assert.ok(late.some((m) => m.includes("NR-7")));
});

test("Confirmação: converte em colaborador, preserva o histórico e gera os marcos 30/45/90", async () => {
  // exame em D-2 e admissão em D-1 → válido; ajusta a admissão para hoje
  await updateAdmission(rh, admId, { admissionDate: today, cpf: fakeCpf(SEED) });
  await approveAllDocs(prisma, rh.email, admId);
  const before = await prisma.candidateEvent.count({ where: { candidateId: A.candidateId } });
  const a0 = await getAdmission(rh, admId);
  assert.deepEqual(a0.missing, []);
  const emp = await confirmAdmission(rh, admId);
  empId = emp.id;
  assert.match(emp.internalId!, /^\d{6}$/);
  assert.equal(emp.origin, "RECRUTAMENTO");
  assert.equal(emp.candidateId, A.candidateId);
  assert.equal(emp.applicationId, A.applicationId);
  assert.equal(Number(emp.baseSalary), 2300);
  const app = await prisma.application.findUniqueOrThrow({ where: { id: A.applicationId } });
  assert.equal(app.status, "CONTRATADO");
  assert.equal(app.hiredAt?.toISOString(), localToDate(today, "08:00").toISOString());
  assert.equal((await prisma.jobOpening.findUniqueOrThrow({ where: { id: jobId } })).status, "PREENCHIDA");
  assert.equal((await prisma.candidate.findUniqueOrThrow({ where: { id: A.candidateId } })).hiredEmployeeId, emp.id);
  // histórico seletivo intacto + evento de contratação
  assert.equal(await prisma.interview.count({ where: { id: A.interviewId, applicationId: A.applicationId } }), 1);
  assert.equal(await prisma.candidateEvent.count({ where: { candidateId: A.candidateId } }), before + 1);
  const full = await getEmployee(rh, emp.id);
  assert.equal(full.candidate!.applications[0].interviews.length, 1);
  assert.ok(full.candidate!.events.some((e) => e.type === "CONTRATACAO"));
  assert.ok(full.candidate!.events.some((e) => e.summary.startsWith("Encaminhado para admissão")));
  assert.equal(full.admission?.id, admId);
  assert.deepEqual(full.movements.map((m) => m.type), ["ADMISSAO"]);
  // marcos: admissão hoje, dia da admissão = 1º dia
  assert.deepEqual(full.milestones.map((m) => [m.days, dateKey(m.dueDate), m.isFinal]), [[30, milestoneDate(today, 30, true), false], [45, milestoneDate(today, 45, true), false], [90, milestoneDate(today, 90, true), true]]);
  assert.equal(dateKey(emp.probationEndDate!), addDays(today, 89));
  // processo encerrado não aceita alterações; histórico do candidato é somente inserção
  await assert.rejects(updateAdmission(rh, admId, { salary: "3000" }), /encerrado/);
  await assert.rejects(prisma.candidateEvent.deleteMany({ where: { candidateId: A.candidateId } }));
});

test("CPF: não pode ser reutilizado por outro candidato nem por outro vínculo ativo", async () => {
  const B = await approvedApplication("B");
  const adm = await forwardToAdmission(rh, B.applicationId);
  await assert.rejects(updateAdmission(rh, adm.id, { cpf: fakeCpf(SEED) }), /outro candidato/);
  await assert.rejects(createDirectEmployee(rh, { fullName: `Dup ${TAG}`, cpf: fakeCpf(SEED), admissionDate: today, positionId: posId, departmentId: deptId }), /colaborador ativo/);
  // desistência: candidatura vira "Desistiu", exame agendado é cancelado
  await scheduleExam(rh, adm.id, { clinicId, date: addDays(today, 1), time: "08:00" });
  await assert.rejects(cancelAdmission(rh, adm.id, { reason: "OUTRO" }), /Descreva/);
  await cancelAdmission(rh, adm.id, { reason: "DESISTENCIA_CANDIDATO", note: "Aceitou outra proposta" });
  assert.equal((await prisma.application.findUniqueOrThrow({ where: { id: B.applicationId } })).status, "DESISTENTE");
  assert.equal((await prisma.medicalExam.findFirstOrThrow({ where: { admissionId: adm.id } })).status, "CANCELADO");
  await assert.rejects(forwardToAdmission(rh, B.applicationId), /aprovação em todas as etapas/);
  assert.ok((await prisma.candidateEvent.findMany({ where: { candidateId: B.candidateId } })).some((e) => e.summary.startsWith("Admissão cancelada: Desistência")));
});

test("Alertas ao RH: aviso antecipado e no dia, uma única vez por marco, só para o RH da unidade ou corporativo", async () => {
  const due30 = milestoneDate(today, 30, true);
  const lead = addDays(due30, -5);
  const notifs = () => prisma.notification.findMany({ where: { channel: "IN_APP", relatedId: empId } });
  await probationAlerts(addDays(lead, -1));
  assert.equal((await notifs()).length, 0, "antes da antecedência: nada");
  await probationAlerts(lead);
  const first = await notifs();
  const rhCorp = await prisma.user.findMany({ where: { active: true, role: "RH", unitId: null } });
  assert.equal(first.length, rhCorp.length, "um alerta por RH corporativo (a unidade de teste não tem RH próprio)");
  assert.ok(first.every((n) => n.subject.includes("marco de 30 dias")));
  assert.ok(!first.some((n) => n.recipientUserId === rhBrisa.id), "RH de outra unidade não recebe");
  const emails = await prisma.notification.count({ where: { channel: "EMAIL", template: "experiencia.marco", recipientUserId: rh.id, createdAt: { gte: first[0].createdAt } } });
  assert.ok(emails >= 1, "e-mail consolidado na fila (enviado só com provedor configurado)");
  await probationAlerts(lead);
  assert.equal((await notifs()).length, first.length, "idempotente no mesmo dia");
  await probationAlerts(due30);
  const second = await notifs();
  assert.equal(second.length, first.length * 2);
  assert.ok(second.some((n) => n.subject.includes("vence hoje")));
  await probationAlerts(addDays(due30, 3));
  assert.equal((await notifs()).length, first.length * 2, "atraso não repete o aviso já dado no dia");
});

test("Avaliação dos marcos: regras de resultado por marco", async () => {
  const ms = await prisma.probationMilestone.findMany({ where: { employeeId: empId }, orderBy: { days: "asc" } });
  await assert.rejects(recordMilestone(rh, ms[0].id, { outcome: "EFETIVADO" }), /último marco/);
  await assert.rejects(recordMilestone(rh, ms[2].id, { outcome: "SEGUE" }), /efetivação ou desligamento/);
  await assert.rejects(recordMilestone(rh, ms[0].id, { outcome: "DESLIGAMENTO" }), /motivo/);
  await assert.rejects(recordMilestone(gestor, ms[0].id, { outcome: "SEGUE" }), (e) => status(e) === 403);
  await recordMilestone(rh, ms[0].id, { outcome: "SEGUE", notes: "Boa adaptação" });
  await assert.rejects(recordMilestone(rh, ms[0].id, { outcome: "SEGUE" }), /já foi registrado/);
});

test("Desligamento na experiência: encerra marcos, registra movimentação e histórico; CPF fica livre para readmissão", async () => {
  await assert.rejects(terminateEmployee(rh, empId, { date: addDays(today, -1), type: "PEDIDO_DEMISSAO", reason: "Teste" }), /anterior à admissão/);
  await terminateEmployee(rh, empId, { date: today, type: "RESCISAO_ANTECIPADA_COLABORADOR", reason: "Mudança de cidade" });
  const e = await getEmployee(rh, empId);
  assert.equal(e.status, "DESLIGADO");
  assert.deepEqual(e.milestones.map((m) => m.status), ["REALIZADO", "ENCERRADO_DESLIGAMENTO", "ENCERRADO_DESLIGAMENTO"]);
  assert.deepEqual(e.movements.map((m) => m.type), ["ADMISSAO", "DESLIGAMENTO"]);
  assert.ok(e.candidate!.events.some((ev) => ev.summary.includes("durante a experiência")));
  await assert.rejects(terminateEmployee(rh, empId, { date: today, type: "PEDIDO_DEMISSAO", reason: "Repetido" }), /já desligado/);
  // readmissão: novo vínculo com o mesmo CPF (o anterior fica no histórico)
  const re = await createDirectEmployee(rh, { fullName: `Adm A ${TAG}`, cpf: fakeCpf(SEED), admissionDate: today, positionId: posId, departmentId: deptId });
  assert.notEqual(re.id, empId);
  await assert.rejects(prisma.employee.update({ where: { id: empId }, data: { status: "ATIVO", terminationDate: null, terminationType: null } }), "banco impede dois vínculos ativos com o mesmo CPF");
  await terminateEmployee(rh, re.id, { date: today, type: "RESCISAO_ANTECIPADA_EMPRESA", reason: "Teste" });
});

test("Escopo: gestor não acessa admissões nem salários; RH de outra unidade não vê o colaborador", async () => {
  await assert.rejects(getAdmission(gestor, admId), (e) => status(e) === 403);
  await assert.rejects(getEmployee(rhBrisa, empId), (e) => status(e) === 404);
  assert.ok(!(await listEmployees(gestor, { status: "TODOS" })).some((e) => e.id === empId));
  const brisa = await listEmployees(gestor, { status: "TODOS" });
  if (brisa[0]) assert.equal((await getEmployee(gestor, brisa[0].id)).baseSalary, null);
  assert.ok((await getEmployee(admin, empId)).showSalary);
});

test("Permanência: retenção, experiência, tempo médio e turnover com registros conhecidos (2025)", async () => {
  const dept2 = (await prisma.department.create({ data: { name: "Governança", unitId } })).id;
  const cam = (await prisma.position.findUniqueOrThrow({ where: { title: "Camareira" } })).id;
  const mk = async (n: string, adm: string, dep = deptId, pos = posId) => createDirectEmployee(rh, { fullName: `Perm ${n} ${TAG}`, cpf: fakeCpf(SEED + 10 + n.charCodeAt(0)), admissionDate: adm, positionId: pos, departmentId: dep });
  const X = await mk("X", "2025-02-03");
  const Y = await mk("Y", "2024-06-01");
  await mk("Z", "2025-05-05", dept2, cam);
  await mk("W", "2023-01-02");
  await terminateEmployee(rh, X.id, { date: "2025-03-10", type: "RESCISAO_ANTECIPADA_EMPRESA", reason: "Desempenho" });
  await terminateEmployee(rh, Y.id, { date: "2025-08-15", type: "PEDIDO_DEMISSAO", reason: "Outra proposta" });
  const r = await buildPermanence(rh, { gran: "ano", ref: "2025-06-01", unidade: unitId });
  // início de 2025: Y e W · fim de 2025: Z e W
  assert.deepEqual(r.headcount, { start: 2, end: 2, avg: 2 });
  assert.equal(r.admissions, 2);
  assert.equal(r.terminations, 2);
  assert.equal(r.total?.turnover, 1);
  assert.equal(r.total?.voluntary, 1);
  const ret = Object.fromEntries(r.retention.map((x) => [x.days, [x.r.num, x.r.den]]));
  assert.deepEqual(ret[30], [2, 2]); // X saiu no 36º dia
  assert.deepEqual(ret[45], [1, 2]);
  assert.deepEqual(ret[90], [1, 2]);
  assert.equal(r.probation.count, 1);
  assert.deepEqual([r.probation.share.num, r.probation.share.den], [1, 2]);
  assert.equal(r.leavers.n, 2);
  assert.equal(r.leavers.mean, (36 + 441) / 2); // X: 03/02→10/03 (36 dias) · Y: 01/06/2024→15/08/2025 (441 dias)
  const recep = r.byPosition.find((p) => p.label === "Recepcionista")!;
  assert.deepEqual([recep.start, recep.end, recep.terminations], [2, 1, 2]);
  const camRow = r.byPosition.find((p) => p.label === "Camareira")!;
  assert.deepEqual([camRow.start, camRow.end, camRow.admissions, camRow.turnover], [0, 1, 1, 0]);
  // tipo de experiência fora do período é recusado
  const W = await prisma.employee.findFirstOrThrow({ where: { fullName: { startsWith: "Perm W" }, admissionDate: localToDate("2023-01-02"), department: { unitId } } });
  await assert.rejects(terminateEmployee(rh, W.id, { date: today, type: "TERMINO_EXPERIENCIA", reason: "Fim do contrato" }), /Fora do período de experiência/);
});
