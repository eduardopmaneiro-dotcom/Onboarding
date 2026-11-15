import { prisma } from "@/lib/prisma";
import type { NotificationChannel } from "@prisma/client";

/**
 * Outbox de notificações. Nesta fase os e-mails são enfileirados (status PENDENTE);
 * o worker de envio (SMTP/SES/Sendgrid) entra na fase de comunicações automáticas.
 * Em desenvolvimento, o conteúdo é exibido no console para permitir testes.
 */
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
  const n = await prisma.notification.create({
    data: { channel: input.channel ?? "EMAIL", ...input },
  });
  if (process.env.NODE_ENV !== "production") {
    console.info(`\n[notificação:${n.template}] para ${input.recipientEmail ?? input.recipientUserId}\n${input.subject}\n${input.body}\n`);
  }
  return n;
}

export async function listNotifications(limit = 50) {
  return prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
