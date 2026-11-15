import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emailConfig } from "@/modules/email/config";
import { EmailNotConfiguredError, sendEmail } from "@/modules/email/transport";

/** Intervalos entre tentativas (minutos): 1, 5, 15, 60, 240. Na 6ª falha: FALHOU. */
const BACKOFF_MIN = [1, 5, 15, 60, 240];

export async function enqueueEmail(input: {
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html?: string | null;
  template: string;
  recipientUserId?: string | null;
  relatedEntity?: string;
  relatedId?: string;
  digestId?: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  return db.notification.create({
    data: {
      channel: "EMAIL",
      recipientEmail: input.to,
      recipientUserId: input.recipientUserId ?? null,
      cc: input.cc ?? [],
      subject: input.subject.slice(0, 250),
      body: input.text,
      htmlBody: input.html ?? null,
      template: input.template,
      relatedEntity: input.relatedEntity,
      relatedId: input.relatedId,
      digestId: input.digestId,
      nextAttemptAt: new Date(),
    },
  });
}

/** Tenta enviar uma mensagem (com trava atômica: dois processos nunca enviam a mesma). */
export async function deliver(notificationId: string): Promise<"ENVIADA" | "PENDENTE" | "FALHOU" | "IGNORADA"> {
  const claimed = await prisma.notification.updateMany({
    where: { id: notificationId, status: "PENDENTE", channel: "EMAIL" },
    data: { status: "ENVIANDO", lockedAt: new Date() },
  });
  if (!claimed.count) return "IGNORADA";
  const n = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  try {
    const r = await sendEmail({ to: n.recipientEmail!, cc: n.cc, subject: n.subject, text: n.body, html: n.htmlBody });
    await prisma.notification.update({ where: { id: n.id }, data: { status: "ENVIADA", sentAt: new Date(), providerId: r.providerId, error: null, lockedAt: null, attempts: n.attempts + 1 } });
    return "ENVIADA";
  } catch (e) {
    // Sem configuração: não conta tentativa, fica na fila aguardando (nada é simulado)
    if (e instanceof EmailNotConfiguredError) {
      await prisma.notification.update({ where: { id: n.id }, data: { status: "PENDENTE", lockedAt: null, error: e.message, nextAttemptAt: new Date(Date.now() + 15 * 60_000) } });
      return "PENDENTE";
    }
    const attempts = n.attempts + 1;
    const failed = attempts >= n.maxAttempts;
    const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
    await prisma.notification.update({
      where: { id: n.id },
      data: {
        status: failed ? "FALHOU" : "PENDENTE",
        attempts,
        lockedAt: null,
        error: String((e as Error).message ?? e).slice(0, 500),
        nextAttemptAt: failed ? n.nextAttemptAt : new Date(Date.now() + wait * 60_000),
      },
    });
    return failed ? "FALHOU" : "PENDENTE";
  }
}

/** Processa a fila: mensagens vencidas, em ordem. Destrava envios interrompidos há mais de 10 min. */
export async function processOutbox(limit = 25) {
  await prisma.notification.updateMany({ where: { status: "ENVIANDO", lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "PENDENTE", lockedAt: null } });
  if (!emailConfig().ready) return { sent: 0, pending: await prisma.notification.count({ where: { status: "PENDENTE", channel: "EMAIL" } }), failed: 0, configured: false };
  const due = await prisma.notification.findMany({ where: { status: "PENDENTE", channel: "EMAIL", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  const stats = { sent: 0, pending: 0, failed: 0, configured: true };
  for (const { id } of due) {
    const r = await deliver(id);
    if (r === "ENVIADA") stats.sent++;
    else if (r === "PENDENTE") stats.pending++;
    else if (r === "FALHOU") stats.failed++;
  }
  return stats;
}

/** Reenvio manual pelo RH (zera tentativas). */
export async function retryNow(notificationId: string) {
  await prisma.notification.updateMany({ where: { id: notificationId, status: { in: ["FALHOU", "PENDENTE"] } }, data: { status: "PENDENTE", attempts: 0, nextAttemptAt: new Date(), error: null } });
  return deliver(notificationId);
}
