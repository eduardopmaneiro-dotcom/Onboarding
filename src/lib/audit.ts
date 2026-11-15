import { prisma } from "@/lib/prisma";
import { requestMeta } from "@/lib/request";
import type { AuditAction, Prisma, Role } from "@prisma/client";

/** Campos que nunca devem ir para a trilha de auditoria em claro. */
const REDACT = new Set(["passwordHash", "password", "cpf", "cpfEnc", "cpfHash", "tokenHash", "token"]);

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.has(k) ? "[protegido]" : redact(v)])
    ) as T;
  }
  return value;
}

/**
 * Trilha de auditoria (somente inserção). Toda mutação relevante, acesso a dado
 * pessoal e evento de autenticação passa por aqui. Não há UPDATE/DELETE de AuditLog no código.
 */
export async function recordAudit(params: {
  entityType: string;
  entityId?: string | null;
  action: AuditAction;
  actorId?: string | null;
  actorRole?: Role | null;
  impactedEmployeeId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  justification?: string;
}) {
  const meta = await requestMeta();
  const json = (v: unknown) => (v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(redact(v))) as Prisma.InputJsonValue));
  return prisma.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      actorId: params.actorId ?? null,
      actorRole: params.actorRole ?? null,
      impactedEmployeeId: params.impactedEmployeeId ?? null,
      previousValue: json(params.previousValue),
      newValue: json(params.newValue),
      justification: params.justification,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}
