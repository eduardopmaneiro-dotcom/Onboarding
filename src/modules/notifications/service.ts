import { prisma } from "@/lib/prisma";
import type { NotificationChannel } from "@prisma/client";

/** URL pública da aplicação (APP_URL > domínio de produção da Vercel > localhost). */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/**
 * Envio de e-mail via Resend (API HTTP — funciona em serverless). Ativado quando
 * RESEND_API_KEY e EMAIL_FROM estão definidos; sem eles, a mensagem fica na fila (PENDENTE).
 */
async function sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "envio não configurado" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

export async function enqueueNotification(input: {
  channel?: NotificationChannel;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  template: string;
  subject: string;
  body: string;
  relatedEntity?: string;
  relatedId?: string;
}) {
  const n = await prisma.notification.create({ data: { channel: input.channel ?? "EMAIL", ...input } });
  if ((input.channel ?? "EMAIL") === "EMAIL" && input.recipientEmail) {
    const r = await sendEmail(input.recipientEmail, input.subject, input.body);
    if (r.ok) await prisma.notification.update({ where: { id: n.id }, data: { status: "ENVIADA", sentAt: new Date() } });
    else if (r.error !== "envio não configurado") await prisma.notification.update({ where: { id: n.id }, data: { status: "FALHOU", error: r.error } });
  }
  if (process.env.NODE_ENV !== "production") {
    console.info(`\n[notificação:${n.template}] para ${input.recipientEmail ?? input.recipientUserId}\n${input.subject}\n${input.body}\n`);
  }
  return n;
}

export async function listNotifications(limit = 50) {
  return prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
