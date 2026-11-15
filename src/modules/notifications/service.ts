import { prisma } from "@/lib/prisma";
import { deliver, enqueueEmail } from "@/modules/email/outbox";

/** URL pública da aplicação (APP_URL > domínio de produção da Vercel > localhost). */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/**
 * Mensagem avulsa (ex.: redefinição de senha): entra na fila e tenta o envio na hora.
 * Se o provedor falhar, as novas tentativas seguem pela fila.
 */
export async function enqueueNotification(input: {
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  template: string;
  subject: string;
  body: string;
  relatedEntity?: string;
  relatedId?: string;
}) {
  if (!input.recipientEmail) return null;
  const n = await enqueueEmail({ to: input.recipientEmail, subject: input.subject, text: input.body, template: input.template, recipientUserId: input.recipientUserId, relatedEntity: input.relatedEntity, relatedId: input.relatedId });
  await deliver(n.id).catch(() => undefined);
  if (process.env.NODE_ENV === "development") console.info(`\n[e-mail:${n.template}] para ${input.recipientEmail}\n${input.subject}\n`);
  return n;
}

export async function listNotifications(limit = 50) {
  return prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
