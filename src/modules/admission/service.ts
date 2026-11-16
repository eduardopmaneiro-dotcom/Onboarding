import { z } from "zod";
import type { AdmissionCancelReason, AdmissionDocStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, can, type CurrentUser } from "@/lib/session";
import { addDays, dateKey, fmtDate, fmtDateTime, localToDate, todayKey } from "@/lib/datetime";
import { maskedFromEnc, protectCpf } from "@/lib/cpf";
import { parseMoney } from "@/lib/text";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { cpf as cpfSchema } from "@/modules/shared/validation";
import { recordEvent } from "@/modules/recruitment/events";
import { jobScopeWhere } from "@/modules/recruitment/scope";
import { storeDocument } from "@/modules/documents/service";
import { admissionScopeWhere } from "@/modules/people/scope";
import { currentRule } from "@/modules/people/rule-settings";
import { createEmployeeTx } from "@/modules/people/service";
import { CANCEL_REASON_LABEL, DOC_STATUS_LABEL, EXAM_RESULT_LABEL } from "@/modules/admission/constants";

const dateStr = z.string({ error: "Data obrigatória" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").refine((v) => new Date(`${v}T12:00:00Z`).toISOString().startsWith(v), "Data inexistente");
const timeStr = z.string({ error: "Horário obrigatório" }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

async function nextAdmissionCode(tx: Prisma.TransactionClient, year: number) {
  const [{ n }] = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('admission_code_seq') AS n`;
  return `ADM-${year}-${String(n).padStart(4, "0")}`;
}

/** Candidaturas com aprovação final (RH + gestor + avaliação externa, quando houver) sem processo admissional aberto. */
export async function readyForAdmission(user: CurrentUser) {
  assertCan(user, "admissoes.view");
  return prisma.application.findMany({
    where: { status: "APROVADO", jobOpening: jobScopeWhere(user), admissions: { none: { status: { not: "CANCELADA" } } } },
    orderBy: { approvedAt: "asc" },
    include: { candidate: { select: { id: true, fullName: true } }, jobOpening: { include: { position: { select: { title: true } }, department: { include: { unit: { select: { name: true } } } } } } },
  });
}

/** Encaminha para admissão: cria o processo com os dados da vaga e o checklist vigente. */
export async function forwardToAdmission(actor: CurrentUser, applicationId: string) {
  assertCan(actor, "admissoes.manage");
  const app = await prisma.application.findFirst({ where: { id: applicationId, jobOpening: jobScopeWhere(actor) }, include: { jobOpening: true, candidate: true } });
  if (!app) throw new NotFoundError("Candidatura não encontrada");
  if (app.status !== "APROVADO") throw new ValidationError("Só candidatos com aprovação em todas as etapas obrigatórias (RH, gestor e avaliação externa, quando houver) podem ir para admissão");
  const open = await prisma.admission.findFirst({ where: { applicationId, status: { not: "CANCELADA" } } });
  if (open) throw new ValidationError(`Já existe o processo ${open.code} para esta candidatura`);
  const types = await prisma.admissionDocType.findMany({ where: { active: true } });
  const job = app.jobOpening;
  const adm = await prisma.$transaction(async (tx) => {
    const a = await tx.admission.create({
      data: {
        code: await nextAdmissionCode(tx, new Date().getFullYear()), applicationId, candidateId: app.candidateId,
        positionId: job.positionId, departmentId: job.departmentId, managerId: job.requestingManagerId,
        salary: app.offeredSalary ?? job.expectedSalary, contractType: job.contractType, schedule: job.schedule, shift: job.shift, workHours: job.workHours, weeklyHours: job.weeklyHours,
        createdById: actor.id,
        documents: { create: types.map((t) => ({ docTypeId: t.id })) },
      },
    });
    await recordEvent(tx, { candidateId: app.candidateId, applicationId, type: "ADMISSAO", summary: `Encaminhado para admissão (${a.code})`, actorUserId: actor.id });
    return a;
  });
  await recordAudit({ entityType: "Admission", entityId: adm.id, action: "CREATE", actorId: actor.id, actorRole: actor.role, newValue: { applicationId, code: adm.code } });
  return adm;
}

export async function listAdmissions(user: CurrentUser, status?: "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA") {
  assertCan(user, "admissoes.view");
  return prisma.admission.findMany({
    where: { ...admissionScopeWhere(user), ...(status ? { status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      candidate: { select: { fullName: true } }, position: { select: { title: true } }, department: { include: { unit: { select: { name: true } } } },
      documents: { include: { docType: true } }, exams: { orderBy: { scheduledAt: "desc" }, take: 1 },
    },
  });
}

type AdmFull = Prisma.AdmissionGetPayload<{ include: { documents: { include: { docType: true } }; exams: true; candidate: true } }>;

/** Documento exigido neste processo? (obrigatório no checklist e condição atendida) */
export function isRequired(a: Pick<AdmFull, "hasDependents" | "educationRequired">, t: { required: boolean; condition: string }) {
  if (t.condition === "COM_DEPENDENTES" && !a.hasDependents) return false;
  if (t.condition === "ESCOLARIDADE_EXIGIDA" && !a.educationRequired) return false;
  return t.required;
}
export function isApplicable(a: Pick<AdmFull, "hasDependents" | "educationRequired">, t: { condition: string }) {
  return !(t.condition === "COM_DEPENDENTES" && !a.hasDependents) && !(t.condition === "ESCOLARIDADE_EXIGIDA" && !a.educationRequired);
}

/** O que falta para confirmar a contratação (lista vazia = pronto). */
export function readiness(a: AdmFull): string[] {
  const missing: string[] = [];
  if (!a.admissionDate) missing.push("Data de admissão");
  if (!a.salary) missing.push("Salário");
  if (!a.schedule) missing.push("Escala");
  if (!a.managerId) missing.push("Gestor");
  if (!a.candidate.cpfEnc) missing.push("CPF do candidato");
  const docs = a.documents.filter((d) => d.docType.active || d.status !== "PENDENTE");
  for (const d of docs) if (isRequired(a, d.docType) && d.status !== "APROVADO") missing.push(`Documento: ${d.docType.label} (${DOC_STATUS_LABEL[d.status].toLowerCase()})`);
  const exam = [...a.exams].filter((e) => e.status === "REALIZADO").sort((x, y) => +y.scheduledAt - +x.scheduledAt)[0];
  if (!exam) missing.push("Exame admissional realizado");
  else {
    if (!exam.asoReceivedAt) missing.push("Recebimento do ASO");
    else if (exam.result === "PENDENTE") missing.push("Resultado do ASO");
    else if (exam.result === "INAPTO") missing.push("ASO apto (resultado atual: inapto)");
    if (a.admissionDate && exam.performedAt && dateKey(exam.performedAt) > dateKey(a.admissionDate)) missing.push("Exame realizado até a data de admissão (NR-7: antes do início das atividades)");
  }
  return missing;
}

export async function getAdmission(user: CurrentUser, id: string) {
  assertCan(user, "admissoes.view");
  const base = await prisma.admission.findFirst({ where: { id, ...admissionScopeWhere(user) }, select: { id: true, status: true } });
  if (!base) throw new NotFoundError("Processo de admissão não encontrado");
  // checklist configurável: itens criados depois da abertura entram nos processos em andamento
  if (base.status === "EM_ANDAMENTO") {
    const missingTypes = await prisma.admissionDocType.findMany({ where: { active: true, documents: { none: { admissionId: id } } }, select: { id: true } });
    if (missingTypes.length) await prisma.admissionDocument.createMany({ data: missingTypes.map((t) => ({ admissionId: id, docTypeId: t.id })), skipDuplicates: true });
  }
  const a = await prisma.admission.findUniqueOrThrow({
    where: { id },
    include: {
      candidate: true, position: true, department: { include: { unit: true } }, manager: { select: { id: true, name: true } }, employee: { select: { id: true, internalId: true } },
      application: { include: { jobOpening: { select: { id: true, code: true, headcount: true } } } },
      documents: { include: { docType: true }, orderBy: [{ docType: { sortOrder: "asc" } }] },
      exams: { include: { clinic: true }, orderBy: { scheduledAt: "asc" } },
    },
  });
  const docPerm = can(user, "admissoes.documentos");
  const attachments = docPerm
    ? await prisma.document.findMany({ where: { deletedAt: null, OR: [{ ownerType: "AdmissionDocument", ownerId: { in: a.documents.map((d) => d.id) } }, { ownerType: "MedicalExam", ownerId: { in: a.exams.map((e) => e.id) } }] }, orderBy: { createdAt: "asc" }, select: { id: true, ownerType: true, ownerId: true, originalName: true, sizeBytes: true, createdAt: true } })
    : [];
  return { ...a, cpfMasked: a.candidate.cpfEnc ? maskedFromEnc(a.candidate.cpfEnc) : null, missing: readiness(a), attachments, docPerm, showSalary: can(user, "colaboradores.salario") };
}

async function loadOpen(actor: CurrentUser, id: string) {
  assertCan(actor, "admissoes.manage");
  const a = await prisma.admission.findFirst({ where: { id, ...admissionScopeWhere(actor) }, include: { candidate: true, application: true } });
  if (!a) throw new NotFoundError("Processo de admissão não encontrado");
  if (a.status !== "EM_ANDAMENTO") throw new ValidationError("Processo encerrado — não pode mais ser alterado");
  return a;
}

const optInt = z.preprocess((v) => (v === undefined || v === "" ? undefined : Number(v)), z.number().int().min(1).max(60).optional());
const dataInput = z.object({
  admissionDate: dateStr.optional(),
  positionId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  managerId: z.string().optional(),
  salary: z.string().optional(),
  contractType: z.enum(["CLT", "PJ", "ESTAGIO", "TEMPORARIO"]).optional(),
  schedule: z.enum(["SEIS_POR_UM", "CINCO_POR_DOIS", "DOZE_POR_TRINTA_E_SEIS", "OUTRA"]).optional(),
  shift: z.enum(["DIURNO", "NOTURNO", "MISTO", "ADMINISTRATIVO"]).optional(),
  workHours: z.string().trim().max(60).optional(),
  weeklyHours: optInt,
  hasDependents: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
  educationRequired: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
  cpf: cpfSchema.optional(),
});

/** Dados da admissão (data, cargo, salário, departamento → unidade, gestor, escala) e CPF do candidato. */
export async function updateAdmission(actor: CurrentUser, id: string, raw: unknown) {
  const a = await loadOpen(actor, id);
  const d = dataInput.parse(raw);
  const salary = d.salary ? parseMoney(d.salary) : null;
  if (d.salary && (!salary || salary <= 0)) throw new ValidationError("Salário inválido", { salary: ["Informe o valor (ex.: 2.150,00)"] });
  if (d.departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: d.departmentId, active: true } });
    if (!dept) throw new ValidationError("Departamento inválido", { departmentId: ["Departamento inativo"] });
    if (actor.role === "RH" && actor.unitId && dept.unitId !== actor.unitId) throw new ValidationError("Departamento fora da sua unidade", { departmentId: ["Fora da sua unidade"] });
  }
  if (d.managerId && !(await prisma.manager.findFirst({ where: { id: d.managerId, active: true } }))) throw new ValidationError("Gestor inválido", { managerId: ["Gestor inativo"] });
  if (d.admissionDate && a.application.approvedAt && d.admissionDate < dateKey(a.application.approvedAt)) throw new ValidationError("A admissão não pode ser anterior à aprovação final", { admissionDate: [`Aprovação em ${fmtDate(a.application.approvedAt)}`] });
  if (d.admissionDate && d.admissionDate < addDays(todayKey(), -60)) throw new ValidationError("Data de admissão muito antiga para um processo em andamento", { admissionDate: ["Mais de 60 dias atrás"] });
  let cpfData: { cpfHash: string; cpfEnc: string } | null = null;
  if (d.cpf) {
    cpfData = protectCpf(d.cpf);
    const other = await prisma.candidate.findFirst({ where: { cpfHash: cpfData.cpfHash, id: { not: a.candidateId } }, select: { fullName: true } });
    if (other) throw new ValidationError(`CPF já cadastrado para outro candidato (${other.fullName}) — verifique duplicidade`, { cpf: ["CPF de outro candidato"] });
    const emp = await prisma.employee.findFirst({ where: { cpfHash: cpfData.cpfHash, status: { not: "DESLIGADO" } }, select: { fullName: true } });
    if (emp) throw new ValidationError(`CPF de colaborador ativo (${emp.fullName})`, { cpf: ["Colaborador ativo"] });
  }
  await prisma.$transaction(async (tx) => {
    await tx.admission.update({
      where: { id },
      data: {
        admissionDate: d.admissionDate ? localToDate(d.admissionDate) : undefined,
        positionId: d.positionId, departmentId: d.departmentId, managerId: d.managerId === undefined ? undefined : d.managerId || null,
        salary: salary ?? undefined, contractType: d.contractType, schedule: d.schedule, shift: d.shift, workHours: d.workHours, weeklyHours: d.weeklyHours,
        hasDependents: d.hasDependents, educationRequired: d.educationRequired,
      },
    });
    if (cpfData) await tx.candidate.update({ where: { id: a.candidateId }, data: cpfData });
  });
  await recordAudit({ entityType: "Admission", entityId: id, action: "UPDATE", actorId: actor.id, actorRole: actor.role, newValue: { ...d, cpf: d.cpf ? "[protegido]" : undefined, salary: salary ? "[restrito]" : undefined } });
}

const docStatusInput = z.object({
  status: z.enum(["PENDENTE", "RECEBIDO", "EM_ANALISE", "APROVADO", "RECUSADO"]),
  refusalReason: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function setDocumentStatus(actor: CurrentUser, documentId: string, raw: unknown) {
  const doc = await prisma.admissionDocument.findUnique({ where: { id: documentId }, include: { docType: true } });
  if (!doc) throw new NotFoundError("Documento não encontrado");
  await loadOpen(actor, doc.admissionId);
  const d = docStatusInput.parse(raw);
  if (d.status === "RECUSADO" && !d.refusalReason) throw new ValidationError("Informe o motivo da recusa (o candidato precisa saber o que corrigir)", { refusalReason: ["Obrigatório na recusa"] });
  await prisma.admissionDocument.update({ where: { id: doc.id }, data: { status: d.status, refusalReason: d.status === "RECUSADO" ? d.refusalReason : null, note: d.note ?? doc.note, statusAt: new Date(), statusById: actor.id } });
  await recordAudit({ entityType: "AdmissionDocument", entityId: doc.id, action: "STATUS_CHANGE", actorId: actor.id, actorRole: actor.role, previousValue: { status: doc.status }, newValue: { status: d.status, refusalReason: d.refusalReason, docType: doc.docType.code } });
}

/** Anexo com acesso restrito (cifrado, classificação SENSIVEL). Pendente → Recebido ao anexar. */
export async function attachAdmissionFile(actor: CurrentUser, target: { documentId?: string; examId?: string }, file: File) {
  assertCan(actor, "admissoes.documentos");
  let admissionId: string, ownerType: string, ownerId: string, category: string;
  if (target.documentId) {
    const doc = await prisma.admissionDocument.findUnique({ where: { id: target.documentId }, include: { docType: true } });
    if (!doc) throw new NotFoundError("Documento não encontrado");
    admissionId = doc.admissionId; ownerType = "AdmissionDocument"; ownerId = doc.id; category = `admissao:${doc.docType.code}`;
  } else if (target.examId) {
    const ex = await prisma.medicalExam.findUnique({ where: { id: target.examId } });
    if (!ex) throw new NotFoundError("Exame não encontrado");
    admissionId = ex.admissionId; ownerType = "MedicalExam"; ownerId = ex.id; category = "aso";
  } else throw new ValidationError("Escolha o documento");
  await loadOpen(actor, admissionId);
  const stored = await storeDocument(actor, { ownerType, ownerId, category, file, classification: "SENSIVEL" });
  if (ownerType === "AdmissionDocument") await prisma.admissionDocument.updateMany({ where: { id: ownerId, status: "PENDENTE" }, data: { status: "RECEBIDO", statusAt: new Date(), statusById: actor.id } });
  return stored;
}

const examInput = z.object({ clinicId: z.string({ error: "Escolha a clínica" }).min(1, "Escolha a clínica"), date: dateStr, time: timeStr, note: z.string().trim().max(300).optional() });

export async function scheduleExam(actor: CurrentUser, admissionId: string, raw: unknown) {
  await loadOpen(actor, admissionId);
  const d = examInput.parse(raw);
  const clinic = await prisma.clinic.findFirst({ where: { id: d.clinicId, active: true } });
  if (!clinic) throw new ValidationError("Clínica inválida", { clinicId: ["Clínica inativa"] });
  const open = await prisma.medicalExam.findFirst({ where: { admissionId, status: "AGENDADO" } });
  if (open) throw new ValidationError("Já existe exame agendado — registre a realização, a falta ou cancele antes de remarcar");
  const ex = await prisma.medicalExam.create({ data: { admissionId, clinicId: clinic.id, scheduledAt: localToDate(d.date, d.time), note: d.note ?? null, createdById: actor.id } });
  const adm = await prisma.admission.findUniqueOrThrow({ where: { id: admissionId } });
  await prisma.$transaction((tx) => recordEvent(tx, { candidateId: adm.candidateId, applicationId: adm.applicationId, type: "ADMISSAO", summary: `Exame admissional agendado: ${clinic.name}, ${fmtDateTime(ex.scheduledAt)}`, actorUserId: actor.id }));
  return ex;
}

const examUpdate = z.discriminatedUnion("action", [
  z.object({ action: z.literal("realizado"), date: dateStr }),
  z.object({ action: z.literal("aso"), date: dateStr, result: z.enum(["APTO", "APTO_COM_RESTRICOES", "INAPTO"], { error: "Escolha o resultado do ASO" }), note: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("falta") }),
  z.object({ action: z.literal("cancelar") }),
]);

/** Realização, recebimento do ASO (com resultado), falta ou cancelamento. */
export async function updateExam(actor: CurrentUser, examId: string, raw: unknown) {
  const ex = await prisma.medicalExam.findUnique({ where: { id: examId }, include: { clinic: true } });
  if (!ex) throw new NotFoundError("Exame não encontrado");
  const adm = await loadOpen(actor, ex.admissionId);
  const d = examUpdate.parse(raw);
  const today = todayKey();
  let summary = "";
  if (d.action === "realizado") {
    if (ex.status !== "AGENDADO") throw new ValidationError("Exame não está agendado");
    if (d.date > today) throw new ValidationError("A realização não pode ser no futuro", { date: ["Data futura"] });
    await prisma.medicalExam.update({ where: { id: ex.id }, data: { status: "REALIZADO", performedAt: localToDate(d.date, "12:00") } });
    summary = `Exame admissional realizado em ${fmtDate(localToDate(d.date))}`;
  } else if (d.action === "aso") {
    if (ex.status !== "REALIZADO") throw new ValidationError("Registre a realização do exame antes do ASO");
    if (ex.performedAt && d.date < dateKey(ex.performedAt)) throw new ValidationError("O ASO não pode ser recebido antes do exame", { date: ["Antes do exame"] });
    if (d.date > today) throw new ValidationError("Data futura", { date: ["Data futura"] });
    await prisma.medicalExam.update({ where: { id: ex.id }, data: { asoReceivedAt: localToDate(d.date, "12:00"), result: d.result, note: d.note ?? ex.note } });
    summary = `ASO recebido: ${EXAM_RESULT_LABEL[d.result]}`;
  } else {
    if (ex.status !== "AGENDADO") throw new ValidationError("Só exames agendados podem ser marcados como falta ou cancelados");
    await prisma.medicalExam.update({ where: { id: ex.id }, data: { status: d.action === "falta" ? "NAO_COMPARECEU" : "CANCELADO" } });
    summary = d.action === "falta" ? `Não compareceu ao exame admissional (${fmtDateTime(ex.scheduledAt)})` : "Exame admissional cancelado";
  }
  await prisma.$transaction((tx) => recordEvent(tx, { candidateId: adm.candidateId, applicationId: adm.applicationId, type: "ADMISSAO", summary, actorUserId: actor.id }));
  await recordAudit({ entityType: "MedicalExam", entityId: ex.id, action: "UPDATE", actorId: actor.id, actorRole: actor.role, newValue: d });
}

/**
 * Confirmação da contratação: converte o candidato em colaborador (o cadastro e todo o histórico
 * seletivo continuam ligados), gera os marcos da experiência e registra a admissão para os indicadores.
 */
export async function confirmAdmission(actor: CurrentUser, id: string) {
  await loadOpen(actor, id);
  const a = await prisma.admission.findUniqueOrThrow({ where: { id }, include: { documents: { include: { docType: true } }, exams: true, candidate: true, application: { include: { jobOpening: true } }, position: true } });
  const missing = readiness(a);
  if (missing.length) throw new ValidationError(`Faltam ${missing.length} item(ns) para confirmar: ${missing.join("; ")}`);
  if (a.application.status !== "APROVADO") throw new ValidationError("A candidatura não está mais aprovada");
  const admission = dateKey(a.admissionDate!);
  const rule = await currentRule();
  const emp = await prisma.$transaction(async (tx) => {
    const e = await createEmployeeTx(tx, actor, {
      fullName: a.candidate.fullName, cpfHash: a.candidate.cpfHash, cpfEnc: a.candidate.cpfEnc, email: a.candidate.email, phone: a.candidate.phone,
      contractType: a.contractType, origin: "RECRUTAMENTO", candidateId: a.candidateId, applicationId: a.applicationId,
      departmentId: a.departmentId, positionId: a.positionId, managerId: a.managerId, baseSalary: a.salary, schedule: a.schedule, shift: a.shift,
      workHours: a.workHours, weeklyHours: a.weeklyHours, admission,
    }, rule);
    const hiredAt = localToDate(admission, "08:00");
    await tx.application.update({ where: { id: a.applicationId }, data: { status: "CONTRATADO", hiredAt, hiredById: actor.id } });
    const hired = await tx.application.count({ where: { jobOpeningId: a.application.jobOpeningId, status: "CONTRATADO" } });
    const job = a.application.jobOpening;
    if (hired >= job.headcount && ["ABERTA", "PAUSADA"].includes(job.status)) await tx.jobOpening.update({ where: { id: job.id }, data: { status: "PREENCHIDA", closedAt: hiredAt } });
    await tx.candidate.update({ where: { id: a.candidateId }, data: { hiredEmployeeId: e.id } });
    await tx.admission.update({ where: { id }, data: { status: "CONCLUIDA", employeeId: e.id, completedAt: new Date(), completedById: actor.id } });
    await recordEvent(tx, { candidateId: a.candidateId, applicationId: a.applicationId, type: "CONTRATACAO", summary: `Contratado(a): ${a.position.title}, admissão em ${fmtDate(localToDate(admission))} — matrícula ${e.internalId}`, actorUserId: actor.id, details: { employeeId: e.id, admissionId: id } });
    return e;
  });
  await recordAudit({ entityType: "Admission", entityId: id, action: "APPROVE", actorId: actor.id, actorRole: actor.role, newValue: { employeeId: emp.id, admissionDate: admission } });
  return emp;
}

const cancelInput = z.object({
  reason: z.enum(Object.keys(CANCEL_REASON_LABEL) as [AdmissionCancelReason, ...AdmissionCancelReason[]], { error: "Escolha o motivo" }),
  note: z.string().trim().max(1000).optional(),
});

/** Cancelamento com motivo. Desistência → candidatura "Desistiu"; demais motivos → "Reprovado" (o motivo fica no histórico). */
export async function cancelAdmission(actor: CurrentUser, id: string, raw: unknown) {
  const a = await loadOpen(actor, id);
  const d = cancelInput.parse(raw);
  if (d.reason === "OUTRO" && !d.note) throw new ValidationError("Descreva o motivo", { note: ["Obrigatório em “Outro”"] });
  await prisma.$transaction(async (tx) => {
    await tx.admission.update({ where: { id }, data: { status: "CANCELADA", cancelReason: d.reason, cancelNote: d.note ?? null, canceledAt: new Date() } });
    await tx.medicalExam.updateMany({ where: { admissionId: id, status: "AGENDADO" }, data: { status: "CANCELADO" } });
    await tx.application.update({ where: { id: a.applicationId }, data: { status: d.reason === "DESISTENCIA_CANDIDATO" ? "DESISTENTE" : "REPROVADO" } });
    await recordEvent(tx, { candidateId: a.candidateId, applicationId: a.applicationId, type: "ADMISSAO", summary: `Admissão cancelada: ${CANCEL_REASON_LABEL[d.reason]}${d.note ? ` — ${d.note}` : ""}`, actorUserId: actor.id });
  });
  await recordAudit({ entityType: "Admission", entityId: id, action: "STATUS_CHANGE", actorId: actor.id, actorRole: actor.role, newValue: { status: "CANCELADA", ...d } });
}

export type DocStatus = AdmissionDocStatus;
