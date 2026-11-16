import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";
import { addDays, dateKey, fmtDate, todayKey } from "@/lib/datetime";
import { enqueueEmail } from "@/modules/email/outbox";
import { toHtml } from "@/modules/email/digests";
import { appUrl } from "@/modules/notifications/service";
import { currentRule } from "@/modules/people/rule-settings";

export const ALERT_TEMPLATE = "experiencia.marco";

/**
 * Alertas da experiência ao RH (idempotente — roda no ciclo de 1 minuto e no cron diário):
 * - aviso antecipado (N dias antes, configurável) e aviso no dia/em atraso, cada um uma única vez por marco;
 * - destinatários: usuários do RH ativos da unidade do colaborador ou corporativos (sem unidade);
 *   sem RH cadastrado, os administradores;
 * - um alerta na plataforma por marco e um e-mail consolidado por pessoa (fila real; sem provedor, aguarda).
 */
export async function probationAlerts(today = todayKey()) {
  const rule = await currentRule();
  const due = await prisma.probationMilestone.findMany({
    where: {
      status: "PENDENTE",
      employee: { status: { not: "DESLIGADO" } },
      dueDate: { lte: new Date(`${addDays(today, rule.leadDays)}T23:59:59-03:00`) },
      OR: [{ alertLeadAt: null }, { alertDueAt: null }],
    },
    include: { employee: { select: { id: true, fullName: true, position: { select: { title: true } }, department: { select: { name: true, unitId: true, unit: { select: { name: true } } } }, manager: { select: { name: true } } } } },
    orderBy: { dueDate: "asc" },
  });
  const items = due
    .map((m) => {
      const key = dateKey(m.dueDate);
      const kind = key <= today ? (m.alertDueAt ? null : "due") : m.alertLeadAt ? null : "lead";
      return kind ? { m, key, kind: kind as "due" | "lead" } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) return { alerts: 0, emails: 0 };

  let users = await prisma.user.findMany({ where: { active: true, role: "RH" }, select: { id: true, name: true, email: true, unitId: true } });
  if (!users.length) users = await prisma.user.findMany({ where: { active: true, role: "ADMIN" }, select: { id: true, name: true, email: true, unitId: true } });
  const perUser = new Map<string, { user: (typeof users)[number]; lines: string[] }>();
  let alerts = 0;
  for (const { m, key, kind } of items) {
    const e = m.employee;
    const when = key < today ? `venceu em ${fmtDate(m.dueDate)} — em atraso` : key === today ? "vence hoje" : `vence em ${fmtDate(m.dueDate)}`;
    const subject = `Experiência: marco de ${m.days} dias de ${e.fullName} ${when}`;
    const line = `• ${e.fullName} — ${e.position.title}, ${e.department.name} (${e.department.unit.name})${e.manager ? `, gestor(a) ${e.manager.name}` : ""}: marco de ${m.days} dias${m.isFinal ? " (fim da experiência)" : ""} ${when}.`;
    const recipients = users.filter((u) => !u.unitId || u.unitId === e.department.unitId);
    await prisma.$transaction(async (tx) => {
      // trava: só quem marcar o envio primeiro cria os alertas (dois ciclos simultâneos não duplicam)
      const claimed = await tx.probationMilestone.updateMany({
        where: { id: m.id, ...(kind === "due" ? { alertDueAt: null } : { alertLeadAt: null }) },
        data: kind === "due" ? { alertDueAt: new Date(), alertLeadAt: m.alertLeadAt ?? new Date() } : { alertLeadAt: new Date() },
      });
      if (!claimed.count) return;
      for (const u of recipients) {
        await tx.notification.create({ data: { channel: "IN_APP", recipientUserId: u.id, template: ALERT_TEMPLATE, subject, body: line.slice(2), relatedEntity: "Employee", relatedId: e.id } });
        alerts++;
        const cur = perUser.get(u.id) ?? { user: u, lines: [] };
        cur.lines.push(line);
        perUser.set(u.id, cur);
      }
    });
  }
  let emails = 0;
  if (rule.email) {
    for (const { user, lines } of perUser.values()) {
      if (!user.email) continue;
      const subject = `Acompanhamento da experiência — ${lines.length} marco(s) para avaliar`;
      const text = `Boa tarde, ${user.name.split(" ")[0]}.\n\nOs seguintes colaboradores têm marcos da experiência para avaliação e acompanhamento:\n\n${lines.join("\n")}\n\nRegistre a avaliação em ${appUrl()}/colaboradores/experiencia\n\nAtenciosamente,\nRecursos Humanos — Riale Hotéis`;
      await enqueueEmail({ to: user.email, subject, text, html: toHtml(subject, text), template: ALERT_TEMPLATE, recipientUserId: user.id, relatedEntity: "ProbationMilestone" });
      emails++;
    }
  }
  return { alerts, emails };
}

export async function myAlerts(user: CurrentUser, take = 20) {
  return prisma.notification.findMany({ where: { channel: "IN_APP", recipientUserId: user.id, status: "PENDENTE" }, orderBy: { createdAt: "desc" }, take });
}

export async function markAlertRead(user: CurrentUser, id: string) {
  await prisma.notification.updateMany({ where: { id, recipientUserId: user.id, channel: "IN_APP" }, data: { status: "LIDA", readAt: new Date() } });
}
