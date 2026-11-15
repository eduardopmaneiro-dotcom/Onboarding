import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { ValidationError } from "@/modules/shared/errors";

/** Configurações conhecidas: tipadas e validadas (chaves livres não são aceitas). */
export const SETTINGS = {
  "company.name": { label: "Nome da empresa", schema: z.string().min(2).max(120), default: "Riale Hotéis" },
  "lgpd.dpo_email": { label: "E-mail do encarregado (DPO)", schema: z.email(), default: "privacidade@rialehoteis.com.br" },
  "lgpd.candidate_retention_months": { label: "Retenção de dados de candidatos (meses)", schema: z.coerce.number().int().min(1).max(60), default: 12 },
  "lgpd.audit_retention_years": { label: "Retenção da trilha de auditoria (anos)", schema: z.coerce.number().int().min(1).max(20), default: 5 },
  "security.max_upload_mb": { label: "Tamanho máximo de documento (MB)", schema: z.coerce.number().int().min(1).max(50), default: 10 },
  "notifications.sender_email": { label: "Remetente das comunicações", schema: z.email(), default: "rh@rialehoteis.com.br" },
} as const;

export type SettingKey = keyof typeof SETTINGS;

export async function getSetting<K extends SettingKey>(key: K): Promise<z.infer<(typeof SETTINGS)[K]["schema"]>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return (row?.value ?? SETTINGS[key].default) as z.infer<(typeof SETTINGS)[K]["schema"]>;
}

export async function listSettings() {
  const rows = await prisma.setting.findMany({ include: { updatedBy: { select: { name: true } } } });
  const map = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => ({
    key,
    label: SETTINGS[key].label,
    value: map.get(key)?.value ?? SETTINGS[key].default,
    updatedAt: map.get(key)?.updatedAt ?? null,
    updatedBy: map.get(key)?.updatedBy?.name ?? null,
  }));
}

export async function updateSetting(actor: CurrentUser, key: string, rawValue: unknown) {
  assertCan(actor, "settings.manage");
  if (!(key in SETTINGS)) throw new ValidationError("Configuração desconhecida");
  const def = SETTINGS[key as SettingKey];
  const parsed = def.schema.safeParse(rawValue);
  if (!parsed.success) throw new ValidationError(`Valor inválido para "${def.label}"`, { [key]: parsed.error.issues.map((i) => i.message) });
  const before = await prisma.setting.findUnique({ where: { key } });
  const value = parsed.data as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, update: { value, updatedById: actor.id }, create: { key, value, description: def.label, updatedById: actor.id } });
  await recordAudit({ entityType: "Setting", entityId: key, action: "UPDATE", actorId: actor.id, actorRole: actor.role, previousValue: before?.value ?? def.default, newValue: parsed.data });
}
