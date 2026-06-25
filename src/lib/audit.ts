import { prisma } from "@/lib/prisma";
import type { AuditAction, Role } from "@prisma/client";

/**
 * Trilha de auditoria imutável (Módulo I). Toda mutação relevante do sistema
 * deve passar por aqui — nunca apagar ou editar um AuditLog já gravado.
 */
export async function recordAudit(params: {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId: string;
  actorRole: Role;
  impactedEmployeeId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  justification?: string;
  notes?: string;
}) {
  return prisma.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId,
      actorRole: params.actorRole,
      impactedEmployeeId: params.impactedEmployeeId ?? null,
      previousValue: params.previousValue === undefined ? undefined : (params.previousValue as object),
      newValue: params.newValue === undefined ? undefined : (params.newValue as object),
      justification: params.justification,
      notes: params.notes,
    },
  });
}
