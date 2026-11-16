import { z } from "zod";
import { SlaStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { ValidationError } from "@/modules/shared/errors";
import type { TargetResolver } from "@/modules/analytics/metrics";

export async function listTargets() {
  return prisma.slaTarget.findMany({ include: { position: { select: { title: true } } }, orderBy: [{ stage: "asc" }, { positionId: "asc" }, { departmentName: "asc" }] });
}

/** Meta mais específica: cargo + departamento > cargo > departamento > padrão da etapa. */
export async function targetResolver(): Promise<TargetResolver> {
  const all = await prisma.slaTarget.findMany();
  return (stage, positionId, departmentName) => {
    const c = all.filter((t) => t.stage === stage);
    return (
      c.find((t) => t.positionId === positionId && t.departmentName === departmentName) ??
      c.find((t) => t.positionId === positionId && !t.departmentName) ??
      c.find((t) => !t.positionId && t.departmentName === departmentName) ??
      c.find((t) => !t.positionId && !t.departmentName)
    )?.targetDays ?? null;
  };
}

const input = z.object({
  stage: z.enum(SlaStage, { error: "Selecione a etapa" }),
  positionId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  departmentName: z.preprocess((v) => (v === "" ? null : v), z.string().max(120).nullable().optional()),
  targetDays: z.coerce.number({ error: "Informe a meta em dias" }).positive("Meta deve ser maior que zero").max(365),
});

export async function saveTarget(user: CurrentUser, raw: unknown) {
  assertCan(user, "relatorios.metas");
  const d = input.parse(raw);
  const existing = await prisma.slaTarget.findFirst({ where: { stage: d.stage, positionId: d.positionId ?? null, departmentName: d.departmentName ?? null } });
  const t = existing
    ? await prisma.slaTarget.update({ where: { id: existing.id }, data: { targetDays: d.targetDays, updatedById: user.id } })
    : await prisma.slaTarget.create({ data: { stage: d.stage, positionId: d.positionId ?? null, departmentName: d.departmentName ?? null, targetDays: d.targetDays, updatedById: user.id } });
  await recordAudit({ entityType: "SlaTarget", entityId: t.id, action: existing ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, previousValue: existing, newValue: t });
  return t;
}

export async function deleteTarget(user: CurrentUser, id: string) {
  assertCan(user, "relatorios.metas");
  const t = await prisma.slaTarget.findUnique({ where: { id } });
  if (!t) throw new ValidationError("Meta não encontrada");
  await prisma.slaTarget.delete({ where: { id } });
  await recordAudit({ entityType: "SlaTarget", entityId: id, action: "DELETE", actorId: user.id, actorRole: user.role, previousValue: t });
}
