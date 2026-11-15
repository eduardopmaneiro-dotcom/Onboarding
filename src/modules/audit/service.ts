import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan, type CurrentUser } from "@/lib/session";

export async function listAudit(actor: CurrentUser, filters: { action?: string; entityType?: string; page?: number } = {}) {
  assertCan(actor, "audit.view");
  const take = 50;
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action ? { action: filters.action as AuditAction } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    // RH não audita ações de administradores (segregação de funções)
    ...(actor.role !== "ADMIN" ? { OR: [{ actorRole: null }, { actorRole: { not: "ADMIN" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, skip: (page - 1) * take, include: { actor: { select: { name: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}
