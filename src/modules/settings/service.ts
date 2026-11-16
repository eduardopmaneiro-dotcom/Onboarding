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
  "email.fechamento_horario": { label: "Horário do fechamento diário das entrevistas (Brasília, HH:MM)", schema: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM"), default: "18:30" },
  "email.fechamento_automatico": { label: "Enviar o fechamento automaticamente no horário (sim/não)", schema: z.preprocess((v) => (typeof v === "string" ? ["true", "sim", "1", "s"].includes(v.trim().toLowerCase()) : v), z.boolean()), default: true },
  "email.agenda_espera_min": { label: "Espera para consolidar o aviso de agenda (minutos, 0 = imediato)", schema: z.coerce.number().int().min(0).max(60), default: 3 },
  "email.copia": { label: "Cópia (CC) dos e-mails aos gestores — e-mails separados por vírgula (opcional)", schema: z.string().trim().max(500).refine((v) => !v || v.split(",").every((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim())), "E-mail inválido na lista"), default: "" },
  "experiencia.marcos": {
    label: "Marcos da experiência (dias, separados por vírgula; o último é o fim da experiência)",
    schema: z.string().trim().refine((v) => {
      const n = v.split(",").map((x) => Number(x.trim()));
      return n.length >= 1 && n.length <= 6 && n.every((x) => Number.isInteger(x) && x >= 1 && x <= 365) && n.every((x, i) => i === 0 || x > n[i - 1]);
    }, "Informe de 1 a 6 números inteiros crescentes entre 1 e 365 (ex.: 30,45,90)"),
    default: "30,45,90",
  },
  "experiencia.conta_dia_admissao": { label: "O dia da admissão conta como 1º dia da experiência (sim/não)", schema: z.preprocess((v) => (typeof v === "string" ? ["true", "sim", "1", "s"].includes(v.trim().toLowerCase()) : v), z.boolean()), default: true },
  "experiencia.aviso_dias": { label: "Avisar o RH quantos dias antes de cada marco", schema: z.coerce.number().int().min(0).max(30), default: 5 },
  "experiencia.alerta_email": { label: "Enviar os alertas da experiência também por e-mail ao RH (sim/não)", schema: z.preprocess((v) => (typeof v === "string" ? ["true", "sim", "1", "s"].includes(v.trim().toLowerCase()) : v), z.boolean()), default: true },
} as const;

/** Configurações que o RH pode alterar (regras da empresa para a admissão), além do Admin. */
export const RH_SETTINGS: SettingKey[] = ["experiencia.marcos", "experiencia.conta_dia_admissao", "experiencia.aviso_dias", "experiencia.alerta_email"];

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
  if (RH_SETTINGS.includes(key as SettingKey) && actor.permissions.has("admissoes.config")) { /* regra da admissão: RH também pode */ }
  else assertCan(actor, "settings.manage");
  if (!(key in SETTINGS)) throw new ValidationError("Configuração desconhecida");
  const def = SETTINGS[key as SettingKey];
  const parsed = def.schema.safeParse(rawValue);
  if (!parsed.success) throw new ValidationError(`Valor inválido para "${def.label}"`, { [key]: parsed.error.issues.map((i) => i.message) });
  const before = await prisma.setting.findUnique({ where: { key } });
  const value = parsed.data as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, update: { value, updatedById: actor.id }, create: { key, value, description: def.label, updatedById: actor.id } });
  await recordAudit({ entityType: "Setting", entityId: key, action: "UPDATE", actorId: actor.id, actorRole: actor.role, previousValue: before?.value ?? def.default, newValue: parsed.data });
}
