import { z } from "zod";
import type { DigestStatus, DigestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { addDays, localToDate, todayKey } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { getSetting } from "@/modules/settings/service";
import { emailConfig } from "@/modules/email/config";
import { deliver, enqueueEmail, retryNow } from "@/modules/email/outbox";
import { closeDay, emitAgenda, emitRectification, managerOfJob, rectificationCandidates, toHtml } from "@/modules/email/digests";

export function emailStatus() {
  return emailConfig();
}

/** Visão de um dia: entrevistas por gestor, pendências de resultado e situação do fechamento. */
export async function dayOverview(user: CurrentUser, date: string) {
  assertCan(user, "comunicacoes.view");
  const [ivs, closing, closingTime, auto] = await Promise.all([
    prisma.interview.findMany({
      where: { scheduledAt: { gte: localToDate(date), lt: localToDate(addDays(date, 1)) }, status: { not: "CANCELADA" }, application: { jobOpening: { isHistorical: false } } },
      include: { application: { include: { candidate: { select: { fullName: true } }, jobOpening: { include: { position: { select: { title: true } }, department: { include: { managers: { where: { active: true }, select: { id: true } } } } } } } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.dailyClosing.findUnique({ where: { date } }),
    getSetting("email.fechamento_horario"),
    getSetting("email.fechamento_automatico"),
  ]);
  const managers = await prisma.manager.findMany({ where: { id: { in: [...new Set(ivs.map((i) => managerOfJob(i.application.jobOpening)).filter(Boolean) as string[])] } }, select: { id: true, name: true, email: true } });
  const groups = managers.map((m) => {
    const list = ivs.filter((i) => managerOfJob(i.application.jobOpening) === m.id);
    return { manager: m, total: list.length, pending: list.filter((i) => i.result === "PENDENTE").map((i) => ({ id: i.id, candidate: i.application.candidate.fullName, job: i.application.jobOpening.position.title, at: i.scheduledAt })) };
  });
  const withoutManager = ivs.filter((i) => !managerOfJob(i.application.jobOpening)).map((i) => ({ id: i.id, candidate: i.application.candidate.fullName, code: i.application.jobOpening.code }));
  return { date, closing, closingTime: String(closingTime), auto: !!auto, groups, withoutManager, total: ivs.length, pending: ivs.filter((i) => i.result === "PENDENTE").length };
}

export async function listDigests(user: CurrentUser, f: { status?: DigestStatus[]; type?: DigestType; from?: string; take?: number } = {}) {
  assertCan(user, "comunicacoes.view");
  return prisma.managerDigest.findMany({
    where: { ...(f.status ? { status: { in: f.status } } : {}), ...(f.type ? { type: f.type } : {}), ...(f.from ? { date: { gte: f.from } } : {}) },
    orderBy: [{ updatedAt: "desc" }],
    take: f.take ?? 50,
    include: { manager: { select: { name: true, email: true } }, notification: { select: { id: true, status: true, attempts: true, error: true, sentAt: true, nextAttemptAt: true } } },
  });
}

export async function getDigest(user: CurrentUser, id: string) {
  assertCan(user, "comunicacoes.view");
  const d = await prisma.managerDigest.findUnique({ where: { id }, include: { manager: true, notification: true } });
  if (!d) throw new NotFoundError("Comunicação não encontrada");
  return d;
}

const editInput = z.object({ subject: z.string().trim().min(5, "Assunto muito curto").max(200), body: z.string().trim().min(20, "Texto muito curto").max(10000) });

/** Edição do texto antes do envio. Vale enquanto a agenda não mudar (senão volta ao texto padrão). */
export async function editDigest(user: CurrentUser, id: string, raw: unknown, preview: { hash: string }) {
  assertCan(user, "comunicacoes.manage");
  const d = await prisma.managerDigest.findUnique({ where: { id } });
  if (!d) throw new NotFoundError();
  if (!["PENDENTE", "AGUARDANDO_REVISAO"].includes(d.status)) throw new ValidationError("Esta comunicação já foi emitida");
  const data = editInput.parse(raw);
  await prisma.managerDigest.update({ where: { id }, data: { customSubject: data.subject, customBody: data.body, customForHash: preview.hash, editedById: user.id, editedAt: new Date() } });
  await recordAudit({ entityType: "ManagerDigest", entityId: id, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: { assunto: data.subject } });
}

export async function sendDigestNow(user: CurrentUser, id: string) {
  assertCan(user, "comunicacoes.manage");
  const n = await emitAgenda(id, { force: true });
  await recordAudit({ entityType: "ManagerDigest", entityId: id, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: { acao: "enviar agora", emitida: !!n } });
  return n;
}

export async function cancelDigest(user: CurrentUser, id: string) {
  assertCan(user, "comunicacoes.manage");
  const r = await prisma.managerDigest.updateMany({ where: { id, status: { in: ["PENDENTE", "AGUARDANDO_REVISAO"] } }, data: { status: "DESCARTADO", note: `Envio cancelado por ${user.name}` } });
  if (!r.count) throw new ValidationError("Esta comunicação já foi emitida ou descartada");
  await recordAudit({ entityType: "ManagerDigest", entityId: id, action: "STATUS_CHANGE", actorId: user.id, actorRole: user.role, newValue: { acao: "não enviar" } });
}

export async function closeDayManual(user: CurrentUser, date: string) {
  assertCan(user, "comunicacoes.manage");
  const r = await closeDay(date, "MANUAL", user.id);
  await recordAudit({ entityType: "DailyClosing", entityId: date, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: r });
  return r;
}

export async function rectify(user: CurrentUser, managerId: string, date: string) {
  assertCan(user, "comunicacoes.manage");
  const n = await emitRectification(managerId, date, user.id);
  await recordAudit({ entityType: "DailyClosing", entityId: date, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: { retificacao: managerId } });
  return n;
}

export async function pendingRectifications(user: CurrentUser) {
  assertCan(user, "comunicacoes.view");
  return rectificationCandidates(14);
}

export async function listMessages(user: CurrentUser, take = 40) {
  assertCan(user, "comunicacoes.view");
  return prisma.notification.findMany({ where: { channel: "EMAIL" }, orderBy: { createdAt: "desc" }, take });
}

export async function retryMessage(user: CurrentUser, id: string) {
  assertCan(user, "comunicacoes.manage");
  const r = await retryNow(id);
  await recordAudit({ entityType: "Notification", entityId: id, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: { reenvio: r } });
  return r;
}

/** E-mail de teste para o próprio usuário — confirma a configuração com um envio real. */
export async function sendTestEmail(user: CurrentUser) {
  assertCan(user, "comunicacoes.manage");
  const cfg = emailConfig();
  if (!cfg.ready) throw new ValidationError(`Configuração incompleta: ${cfg.missing.join(", ")}`);
  const subject = "Teste de envio — Plataforma de RH Riale";
  const text = `Olá, ${user.name.split(" ")[0]}.\n\nEste é um e-mail de teste da Plataforma de RH. Se você o recebeu, o envio automático aos gestores está funcionando.\n\nRecursos Humanos — Riale Hotéis.`;
  const n = await enqueueEmail({ to: user.email, subject, text, html: toHtml(subject, text), template: "teste", recipientUserId: user.id });
  return deliver(n.id);
}

export function todayDefault() {
  return todayKey();
}
