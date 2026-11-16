import { z } from "zod";
import { ExternalCheckStatus, InterviewResult, InterviewType, ManagerDecision, type ApplicationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, can, type CurrentUser } from "@/lib/session";
import { fmtDateTime, localToDate } from "@/lib/datetime";
import { parseMoney } from "@/lib/text";
import { ForbiddenError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordEvent } from "@/modules/recruitment/events";
import { interviewScopeWhere, jobScopeWhere } from "@/modules/recruitment/scope";
import { DECISION_LABEL, EXTERNAL_LABEL, RESULT_LABEL } from "@/modules/recruitment/constants";
import { appUrl, enqueueNotification } from "@/modules/notifications/service";
import { dateKey } from "@/lib/datetime";
import { pairsForInterviews, queueAgenda } from "@/modules/email/digests";

type Tx = Prisma.TransactionClient;

// ═════════════════════════ AGENDAMENTO ═════════════════════════

const scheduleInput = z.object({
  jobOpeningId: z.string({ error: "Selecione a vaga" }).min(1, "Selecione a vaga"),
  candidateIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um candidato").max(30),
  date: z.string({ error: "Informe a data" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  time: z.string({ error: "Informe o horário" }).regex(/^\d{2}:\d{2}$/, "Horário inválido"),
  durationMin: z.preprocess((v) => (v === "" || v === undefined ? 30 : Number(v)), z.number().int().min(5).max(480)),
  /** Vários candidatos: horários em sequência (intervalo = duração) ou todos no mesmo horário */
  sequential: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).optional(),
  interviewerUserId: z.string().min(1).optional(),
  type: z.enum(InterviewType).optional(),
  location: z.string().trim().max(160).optional(),
  /** RH quer revisar o texto do aviso ao gestor antes do envio (padrão: envio automático) */
  reviewEmail: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).optional(),
});

/** Avisa a consolidação de e-mails; falha aqui nunca desfaz o agendamento (fica registrada no log). */
async function notifyAgenda(ids: string[], opts: { hold?: boolean; actorId: string; extraDates?: Array<{ id: string; date: string }> }) {
  try {
    return await queueAgenda(await pairsForInterviews(ids, opts.extraDates ?? []), { hold: opts.hold, actorId: opts.actorId });
  } catch (e) {
    console.error("Falha ao programar aviso ao gestor", e);
    return [];
  }
}

/**
 * Agenda uma ou várias entrevistas para a mesma vaga e data.
 * Departamento, unidade e gestor vêm da vaga; entrevistador padrão = quem agenda.
 */
export async function scheduleInterviews(user: CurrentUser, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const data = scheduleInput.parse(raw);
  const job = await prisma.jobOpening.findFirst({ where: { id: data.jobOpeningId, ...jobScopeWhere(user) }, include: { position: true } });
  if (!job) throw new ValidationError("Vaga não encontrada", { jobOpeningId: ["Vaga inválida"] });
  if (!["ABERTA", "PAUSADA"].includes(job.status)) throw new ValidationError("A vaga não está aberta para entrevistas");
  const interviewerId = data.interviewerUserId ?? user.id;
  const interviewer = await prisma.user.findFirst({ where: { id: interviewerId, active: true } });
  if (!interviewer) throw new ValidationError("Entrevistador inválido", { interviewerUserId: ["Selecione um usuário ativo"] });

  const created = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const [i, candidateId] of data.candidateIds.entries()) {
      const start = localToDate(data.date, data.time);
      if (data.sequential) start.setUTCMinutes(start.getUTCMinutes() + i * data.durationMin);
      let app = await tx.application.findUnique({ where: { candidateId_jobOpeningId: { candidateId, jobOpeningId: job.id } } });
      if (!app) {
        app = await tx.application.create({ data: { candidateId, jobOpeningId: job.id } });
        await recordEvent(tx, { candidateId, applicationId: app.id, type: "CANDIDATURA", summary: `Vinculado à vaga ${job.code} — ${job.position.title}`, actorUserId: user.id });
      }
      const stage = (await tx.interview.count({ where: { applicationId: app.id, status: { not: "CANCELADA" } } })) + 1;
      const iv = await tx.interview.create({
        data: {
          applicationId: app.id,
          type: data.type ?? (stage === 1 ? "TRIAGEM_RH" : "GESTOR"),
          stage,
          scheduledAt: start,
          durationMin: data.durationMin,
          location: data.location ?? null,
          interviewerUserId: interviewer.id,
          interviewerName: interviewer.name,
          createdById: user.id,
        },
      });
      await tx.application.update({ where: { id: app.id }, data: { status: "ENTREVISTA" } });
      await recordEvent(tx, {
        candidateId,
        applicationId: app.id,
        interviewId: iv.id,
        type: "ENTREVISTA_AGENDADA",
        summary: `${stage}ª entrevista agendada para ${fmtDateTime(start)} com ${interviewer.name}`,
        details: { vaga: job.code, entrevistador: interviewer.name, data: start.toISOString() },
        actorUserId: user.id,
      });
      out.push(iv);
    }
    return out;
  });
  await recordAudit({ entityType: "Interview", entityId: created.map((c) => c.id).join(","), action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { vaga: job.code, quantidade: created.length } });
  const notices = await notifyAgenda(created.map((c) => c.id), { hold: data.reviewEmail, actorId: user.id });
  return Object.assign(created, { notices });
}

export async function rescheduleInterview(user: CurrentUser, interviewId: string, date: string, time: string, interviewerUserId?: string) {
  assertCan(user, "recrutamento.manage");
  const iv = await prisma.interview.findFirst({ where: { id: interviewId, ...interviewScopeWhere(user) }, include: { application: true } });
  if (!iv) throw new NotFoundError("Entrevista não encontrada");
  if (iv.result !== "PENDENTE") throw new ValidationError("Entrevista com resultado registrado não pode ser remarcada");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new ValidationError("Data ou horário inválidos");
  const start = localToDate(date, time);
  const interviewer = interviewerUserId ? await prisma.user.findFirst({ where: { id: interviewerUserId, active: true } }) : null;
  await prisma.$transaction(async (tx) => {
    await tx.interview.update({ where: { id: iv.id }, data: { scheduledAt: start, hasTime: true, status: "AGENDADA", ...(interviewer ? { interviewerUserId: interviewer.id, interviewerName: interviewer.name } : {}) } });
    await recordEvent(tx, { candidateId: iv.application.candidateId, applicationId: iv.applicationId, interviewId: iv.id, type: "ENTREVISTA_REMARCADA", summary: `Entrevista remarcada de ${fmtDateTime(iv.scheduledAt, iv.hasTime)} para ${fmtDateTime(start)}`, actorUserId: user.id });
  });
  // avisa o gestor da data nova e, se mudou o dia, também da data antiga
  await notifyAgenda([iv.id], { actorId: user.id, extraDates: [{ id: iv.id, date: dateKey(iv.scheduledAt) }] });
}

export async function cancelInterview(user: CurrentUser, interviewId: string, note?: string) {
  assertCan(user, "recrutamento.manage");
  const iv = await prisma.interview.findFirst({ where: { id: interviewId, ...interviewScopeWhere(user) }, include: { application: true } });
  if (!iv) throw new NotFoundError("Entrevista não encontrada");
  await prisma.$transaction(async (tx) => {
    await tx.interview.update({ where: { id: iv.id }, data: { status: "CANCELADA" } });
    await recordEvent(tx, { candidateId: iv.application.candidateId, applicationId: iv.applicationId, interviewId: iv.id, type: "ENTREVISTA_CANCELADA", summary: `Entrevista de ${fmtDateTime(iv.scheduledAt, iv.hasTime)} cancelada${note ? `: ${note}` : ""}`, actorUserId: user.id });
  });
  await notifyAgenda([iv.id], { actorId: user.id, extraDates: [{ id: iv.id, date: dateKey(iv.scheduledAt) }] });
}

// ═════════════════════════ RESULTADO DO RH ═════════════════════════

const money = z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : parseMoney(v)), z.number().min(0).max(1_000_000).optional());

const resultInput = z.object({
  result: z.enum(InterviewResult, { error: "Selecione o resultado" }),
  reasonId: z.string().min(1).optional(),
  note: z.string().trim().max(2000).optional(),
  offeredSalary: money,
  expectedSalary: money,
  lastSalary: money,
  valuedBenefits: z.array(z.string().max(80)).max(20).optional(),
  externalCheck: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).optional(),
});

/** Status da candidatura a partir das decisões separadas (RH, avaliação externa, gestor). */
function deriveStatus(rh: InterviewResult, ext: ExternalCheckStatus, mgr: ManagerDecision | null): ApplicationStatus {
  if (rh === "REPROVADO") return "REPROVADO";
  if (rh === "DESISTIU") return "DESISTENTE";
  if (rh === "NAO_COMPARECEU") return "NAO_COMPARECEU";
  if (rh === "PENDENTE") return "ENTREVISTA";
  if (ext === "REPROVADO" || mgr === "REPROVADO") return "REPROVADO";
  if (mgr === "NOVA_ENTREVISTA") return "ENTREVISTA";
  if (mgr === "APROVADO") return ext === "AGUARDANDO" ? "AVALIACAO" : "APROVADO";
  return "AGUARDANDO_GESTOR";
}

/** Atualiza a situação; ao virar APROVADO pela primeira vez, registra a data da aprovação final (SLA). */
async function setStatus(tx: Tx, applicationId: string, status: ApplicationStatus) {
  const cur = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { approvedAt: true, status: true } });
  if (cur.status === "CONTRATADO") return; // admissão registrada não é desfeita por recálculo
  await tx.application.update({
    where: { id: applicationId },
    data: { status, approvedAt: status === "APROVADO" ? (cur.approvedAt ?? new Date()) : cur.approvedAt },
  });
}

async function latestDecision(tx: Tx, applicationId: string) {
  const r = await tx.managerReview.findFirst({ where: { applicationId }, orderBy: { requestedAt: "desc" } });
  return r?.status ?? null;
}

/** Cria a avaliação do gestor e envia o aviso por e-mail (fila). */
async function forwardToManager(tx: Tx, user: CurrentUser, applicationId: string) {
  const app = await tx.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { candidate: true, jobOpening: { include: { position: true, department: { include: { unit: true, managers: { where: { active: true }, take: 2 } } }, requestingManager: true } } },
  });
  const job = app.jobOpening;
  const manager = job.requestingManager ?? (job.department.managers.length === 1 ? job.department.managers[0] : null);
  const review = await tx.managerReview.create({ data: { applicationId, managerId: manager?.id ?? null, requestedById: user.id } });
  await recordEvent(tx, {
    candidateId: app.candidateId,
    applicationId,
    type: "ENCAMINHADO_GESTOR",
    summary: manager ? `Encaminhado para avaliação do gestor ${manager.name}` : "Aprovado pelo RH — vaga sem gestor responsável definido",
    actorUserId: user.id,
  });
  // O gestor é avisado no fechamento diário (e-mail consolidado), não a cada aprovação (Fase 3).
  return review;
}

export async function registerResult(user: CurrentUser, interviewId: string, raw: unknown) {
  assertCan(user, "entrevistas.resultado");
  const data = resultInput.parse(raw);
  const iv = await prisma.interview.findFirst({ where: { id: interviewId, ...interviewScopeWhere(user) }, include: { application: true } });
  if (!iv) throw new NotFoundError("Entrevista não encontrada");
  if (iv.status === "CANCELADA") throw new ValidationError("Entrevista cancelada");

  let reasonLabel: string | null = null;
  if (data.result === "REPROVADO" && !data.reasonId) throw new ValidationError("Selecione o motivo da reprovação", { reasonId: ["Obrigatório na reprovação"] });
  if (data.reasonId) {
    const reason = await prisma.rejectionReason.findFirst({ where: { id: data.reasonId } });
    if (!reason) throw new ValidationError("Motivo inválido", { reasonId: ["Inválido"] });
    if (reason.requiresNote && !data.note) throw new ValidationError("Descreva o motivo", { note: ["Obrigatório quando o motivo é “Outro”"] });
    reasonLabel = reason.label;
  }
  const keepReason = data.result === "REPROVADO" || data.result === "DESISTIU";

  await prisma.$transaction(async (tx) => {
    await tx.interview.update({
      where: { id: iv.id },
      data: {
        result: data.result,
        status: data.result === "NAO_COMPARECEU" ? "NAO_COMPARECEU" : data.result === "PENDENTE" ? "AGENDADA" : "REALIZADA",
        reasonId: keepReason ? (data.reasonId ?? null) : null,
        resultNote: data.note ?? null,
        resultAt: new Date(),
        resultById: user.id,
      },
    });

    const salary: Prisma.ApplicationUpdateInput = {};
    if (data.offeredSalary !== undefined) salary.offeredSalary = data.offeredSalary;
    if (data.expectedSalary !== undefined) salary.expectedSalary = data.expectedSalary;
    if (data.lastSalary !== undefined) salary.lastSalary = data.lastSalary;
    if (data.valuedBenefits?.length) salary.valuedBenefits = data.valuedBenefits;
    if (data.result === "APROVADO" && data.externalCheck) salary.externalCheckStatus = "AGUARDANDO";
    if (Object.keys(salary).length && can(user, "recrutamento.salarios")) await tx.application.update({ where: { id: iv.applicationId }, data: salary });

    await recordEvent(tx, {
      candidateId: iv.application.candidateId,
      applicationId: iv.applicationId,
      interviewId: iv.id,
      type: "RESULTADO_RH",
      summary: `Resultado do RH (${iv.stage}ª entrevista): ${RESULT_LABEL[data.result]}${reasonLabel ? ` — ${reasonLabel}` : ""}${data.note ? ` · ${data.note}` : ""}`,
      details: { resultado: data.result, motivo: reasonLabel, observacao: data.note, entrevistador: iv.interviewerName, dataEntrevista: iv.scheduledAt },
      actorUserId: user.id,
    });

    // Aprovado pelo RH → encaminha automaticamente ao gestor (se ainda não houver avaliação pendente)
    if (data.result === "APROVADO") {
      const pending = await tx.managerReview.findFirst({ where: { applicationId: iv.applicationId, status: "PENDENTE" } });
      if (!pending) await forwardToManager(tx, user, iv.applicationId);
    }
    const app = await tx.application.findUniqueOrThrow({ where: { id: iv.applicationId } });
    const mgr = data.result === "APROVADO" ? await latestDecision(tx, iv.applicationId) : null;
    await setStatus(tx, iv.applicationId, deriveStatus(data.result, app.externalCheckStatus, mgr));
  });
  await recordAudit({ entityType: "Interview", entityId: iv.id, action: "UPDATE", actorId: user.id, actorRole: user.role, previousValue: { result: iv.result }, newValue: { result: data.result, reasonId: data.reasonId } });
}

/** Avaliação externa (AGINCO / sindicância) — registrada pelo RH. */
export async function setExternalCheck(user: CurrentUser, applicationId: string, status: ExternalCheckStatus, note?: string) {
  assertCan(user, "entrevistas.resultado");
  const app = await prisma.application.findFirst({ where: { id: applicationId, jobOpening: jobScopeWhere(user) }, include: { interviews: { orderBy: { scheduledAt: "desc" }, take: 1 } } });
  if (!app) throw new NotFoundError("Candidatura não encontrada");
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: applicationId }, data: { externalCheckStatus: status, externalCheckNote: note ?? null } });
    const rh = app.interviews[0]?.result ?? "PENDENTE";
    const mgr = await latestDecision(tx, applicationId);
    await setStatus(tx, applicationId, deriveStatus(rh, status, mgr));
    await recordEvent(tx, { candidateId: app.candidateId, applicationId, type: "AVALIACAO_EXTERNA", summary: `Avaliação externa: ${EXTERNAL_LABEL[status]}${note ? ` · ${note}` : ""}`, actorUserId: user.id });
  });
}

// ═════════════════════════ DECISÃO DO GESTOR ═════════════════════════

const decisionInput = z.object({
  decision: z.enum(["APROVADO", "REPROVADO", "NOVA_ENTREVISTA"], { error: "Selecione a decisão" }),
  justification: z.string().trim().max(2000).optional(),
  reasonId: z.string().min(1).optional(),
});

export async function decideReview(user: CurrentUser, reviewId: string, raw: unknown) {
  const data = decisionInput.parse(raw);
  const review = await prisma.managerReview.findFirst({
    where: { id: reviewId, application: { jobOpening: jobScopeWhere(user) } },
    include: { manager: true, application: { include: { candidate: true, jobOpening: { include: { position: true } }, interviews: { orderBy: { scheduledAt: "desc" }, take: 1 } } } },
  });
  if (!review) throw new NotFoundError("Avaliação não encontrada");
  if (review.status !== "PENDENTE") throw new ValidationError("Esta avaliação já foi decidida");

  // Quem decide: o próprio gestor responsável; ou RH/Admin em nome dele (registrado como tal)
  const isOwner = !!user.managerId && user.managerId === review.managerId && can(user, "aprovacoes.decidir");
  const onBehalf = !isOwner && can(user, "aprovacoes.registrar");
  if (!isOwner && !onBehalf) throw new ForbiddenError("Apenas o gestor responsável pode decidir");
  if (data.decision === "REPROVADO" && !data.justification) throw new ValidationError("Justifique a reprovação", { justification: ["Obrigatória na reprovação"] });
  if (onBehalf && !data.justification) throw new ValidationError("Ao registrar em nome do gestor, informe como a decisão foi tomada", { justification: ["Ex.: “Gestor aprovou por telefone em 16/11”"] });

  await prisma.$transaction(async (tx) => {
    await tx.managerReview.update({
      where: { id: review.id },
      data: { status: data.decision, justification: data.justification ?? null, reasonId: data.decision === "REPROVADO" ? (data.reasonId ?? null) : null, onBehalf, decidedById: user.id, decidedAt: new Date() },
    });
    const app = review.application;
    const rh = app.interviews[0]?.result ?? "APROVADO";
    await setStatus(tx, app.id, deriveStatus(rh, app.externalCheckStatus, data.decision));
    await recordEvent(tx, {
      candidateId: app.candidateId,
      applicationId: app.id,
      type: "DECISAO_GESTOR",
      summary: `${DECISION_LABEL[data.decision]}${review.manager ? ` (${review.manager.name})` : ""}${onBehalf ? ` — registrado por ${user.name}` : ""}${data.justification ? ` · ${data.justification}` : ""}`,
      details: { decisao: data.decision, justificativa: data.justification, emNomeDoGestor: onBehalf },
      actorUserId: user.id,
    });
    if (data.decision === "NOVA_ENTREVISTA" && review.requestedById) {
      const rhUser = await tx.user.findUnique({ where: { id: review.requestedById } });
      if (rhUser)
        await enqueueNotification({
          recipientUserId: rhUser.id,
          recipientEmail: rhUser.email,
          template: "recrutamento.nova_entrevista",
          subject: `Riale RH — gestor pediu nova entrevista: ${app.candidate.fullName}`,
          body: `${review.manager?.name ?? "O gestor"} solicitou nova entrevista com ${app.candidate.fullName} (${app.jobOpening.code} — ${app.jobOpening.position.title}).${data.justification ? `\n\nObservação: ${data.justification}` : ""}\n\n${appUrl()}/candidatos/${app.candidateId}`,
        });
    }
  });
  await recordAudit({ entityType: "ManagerReview", entityId: review.id, action: data.decision === "APROVADO" ? "APPROVE" : data.decision === "REPROVADO" ? "REJECT" : "UPDATE", actorId: user.id, actorRole: user.role, newValue: { decision: data.decision, onBehalf } });
}

export async function listReviews(user: CurrentUser, status: "PENDENTE" | "DECIDIDAS" = "PENDENTE") {
  assertCan(user, "aprovacoes.view");
  const mine = user.role === "GESTOR";
  return prisma.managerReview.findMany({
    where: {
      application: { jobOpening: jobScopeWhere(user) },
      ...(status === "PENDENTE" ? { status: "PENDENTE" } : { status: { not: "PENDENTE" } }),
      ...(mine ? { managerId: user.managerId ?? "__none__" } : {}),
    },
    orderBy: status === "PENDENTE" ? { requestedAt: "asc" } : { decidedAt: "desc" },
    take: status === "PENDENTE" ? 100 : 50,
    include: {
      manager: { select: { id: true, name: true, userId: true } },
      decidedBy: { select: { name: true } },
      requestedBy: { select: { name: true } },
      application: {
        include: {
          candidate: { select: { id: true, fullName: true, phone: true } },
          jobOpening: { include: { position: true, department: { include: { unit: true } } } },
          interviews: { orderBy: { scheduledAt: "desc" }, include: { reason: true } },
        },
      },
    },
  });
}

export async function pendingReviewCount(user: CurrentUser): Promise<number> {
  if (!can(user, "aprovacoes.view")) return 0;
  return prisma.managerReview.count({
    where: { status: "PENDENTE", application: { jobOpening: jobScopeWhere(user) }, ...(user.role === "GESTOR" ? { managerId: user.managerId ?? "__none__" } : {}) },
  });
}

// ═════════════════════════ CONSULTAS DA AGENDA ═════════════════════════

export async function listInterviews(user: CurrentUser, from: Date, to: Date, f: { unitId?: string; interviewerUserId?: string; jobId?: string } = {}) {
  assertCan(user, "entrevistas.view");
  return prisma.interview.findMany({
    where: {
      ...interviewScopeWhere(user),
      scheduledAt: { gte: from, lt: to },
      status: { not: "CANCELADA" },
      ...(f.interviewerUserId ? { interviewerUserId: f.interviewerUserId } : {}),
      ...(f.jobId ? { application: { jobOpeningId: f.jobId } } : {}),
      ...(f.unitId ? { application: { jobOpening: { department: { unitId: f.unitId } } } } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      reason: true,
      application: {
        include: {
          candidate: { select: { id: true, fullName: true, phone: true } },
          jobOpening: { select: { id: true, code: true, position: { select: { title: true } }, department: { select: { name: true, unit: { select: { name: true } } } }, requestingManager: { select: { name: true } } } },
        },
      },
    },
  });
}

/** Entrevistas que já aconteceram e ainda não têm resultado (fila do RH). */
export async function pendingResults(user: CurrentUser) {
  if (!can(user, "entrevistas.resultado")) return [];
  return prisma.interview.findMany({
    where: { ...interviewScopeWhere(user), result: "PENDENTE", status: "AGENDADA", scheduledAt: { lt: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 50,
    include: { application: { include: { candidate: { select: { id: true, fullName: true } }, jobOpening: { select: { code: true, position: { select: { title: true } }, department: { select: { unit: { select: { name: true } } } } } } } } },
  });
}

export async function getInterview(user: CurrentUser, id: string) {
  const iv = await prisma.interview.findFirst({
    where: { id, ...interviewScopeWhere(user) },
    include: {
      reason: true,
      resultBy: { select: { name: true } },
      application: {
        include: {
          candidate: true,
          jobOpening: { include: { position: true, department: { include: { unit: true } }, requestingManager: { select: { name: true, email: true } } } },
          managerReviews: { orderBy: { requestedAt: "desc" }, include: { manager: { select: { name: true } } } },
        },
      },
    },
  });
  if (!iv) throw new NotFoundError("Entrevista não encontrada");
  return iv;
}

export async function listReasons(includeInactive = false) {
  return prisma.rejectionReason.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ order: "asc" }, { label: "asc" }] });
}

export async function listInterviewers() {
  return prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } });
}

// ═════════════════════════ ADMISSÃO (registro mínimo para os indicadores) ═════════════════════════

const hireInput = z.object({ date: z.string({ error: "Informe a data de admissão" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida") });

/**
 * Registra a admissão de um candidato aprovado (data de início). Quando o número de admitidos
 * atinge a quantidade de vagas, a vaga é encerrada como PREENCHIDA.
 */
export async function registerHire(user: CurrentUser, applicationId: string, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const { date } = hireInput.parse(raw);
  const app = await prisma.application.findFirst({ where: { id: applicationId, jobOpening: jobScopeWhere(user) }, include: { jobOpening: { include: { position: true } } } });
  if (!app) throw new NotFoundError("Candidatura não encontrada");
  if (app.status !== "APROVADO") throw new ValidationError("Só é possível registrar admissão de candidato com aprovação final (RH, gestor e avaliação externa, quando houver)");
  const hiredAt = localToDate(date, "08:00");
  if (app.approvedAt && hiredAt < new Date(app.approvedAt.getTime() - 86_400_000)) throw new ValidationError("A admissão não pode ser anterior à aprovação", { date: ["Data anterior à aprovação"] });
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: app.id }, data: { status: "CONTRATADO", hiredAt, hiredById: user.id } });
    await recordEvent(tx, { candidateId: app.candidateId, applicationId: app.id, type: "STATUS", summary: `Admissão registrada para ${fmtDateTime(hiredAt, false)} (${app.jobOpening.position.title})`, actorUserId: user.id });
    const hired = await tx.application.count({ where: { jobOpeningId: app.jobOpeningId, status: "CONTRATADO" } });
    if (hired >= app.jobOpening.headcount && ["ABERTA", "PAUSADA"].includes(app.jobOpening.status)) {
      await tx.jobOpening.update({ where: { id: app.jobOpeningId }, data: { status: "PREENCHIDA", closedAt: hiredAt } });
    }
  });
  await recordAudit({ entityType: "Application", entityId: app.id, action: "STATUS_CHANGE", actorId: user.id, actorRole: user.role, newValue: { status: "CONTRATADO", hiredAt } });
}
