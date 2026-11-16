import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { normalizeText } from "@/lib/text";
import { ValidationError } from "@/modules/shared/errors";
import { DOC_CATEGORIES } from "@/modules/admission/constants";

const bool = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

export async function listDocTypes() {
  return prisma.admissionDocType.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { label: "asc" }] });
}

const docTypeInput = z.object({
  id: z.string().optional(),
  label: z.string({ error: "Nome obrigatório" }).trim().min(3, "Nome do documento").max(160),
  category: z.enum(Object.keys(DOC_CATEGORIES) as [string, ...string[]]),
  description: z.string().trim().max(300).optional(),
  required: bool.default(false),
  condition: z.enum(["SEMPRE", "ESCOLARIDADE_EXIGIDA", "COM_DEPENDENTES"]).default("SEMPRE"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(100),
  active: bool.default(true),
});

/** Item do checklist. Desativar não apaga o histórico de processos já abertos. */
export async function saveDocType(actor: CurrentUser, raw: unknown) {
  assertCan(actor, "admissoes.config");
  const d = docTypeInput.parse(raw);
  const code = normalizeText(d.label).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  const data = { label: d.label, category: d.category, description: d.description ?? null, required: d.required, condition: d.condition, sortOrder: d.sortOrder, active: d.active };
  const saved = d.id
    ? await prisma.admissionDocType.update({ where: { id: d.id }, data })
    : await prisma.admissionDocType.create({ data: { ...data, code: (await prisma.admissionDocType.findUnique({ where: { code } })) ? `${code}_${Date.now().toString(36).toUpperCase()}` : code } });
  await recordAudit({ entityType: "AdmissionDocType", entityId: saved.id, action: d.id ? "UPDATE" : "CREATE", actorId: actor.id, actorRole: actor.role, newValue: data });
  return saved;
}

export async function listClinics(all = false) {
  return prisma.clinic.findMany({ where: all ? {} : { active: true }, orderBy: { name: "asc" } });
}

const clinicInput = z.object({
  id: z.string().optional(),
  name: z.string({ error: "Nome obrigatório" }).trim().min(3, "Nome da clínica").max(120),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  active: bool.default(true),
});

export async function saveClinic(actor: CurrentUser, raw: unknown) {
  assertCan(actor, "admissoes.config");
  const d = clinicInput.parse(raw);
  const dup = await prisma.clinic.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, ...(d.id ? { id: { not: d.id } } : {}) } });
  if (dup) throw new ValidationError("Clínica já cadastrada", { name: ["Nome já usado"] });
  const data = { name: d.name, address: d.address ?? null, phone: d.phone ?? null, active: d.active };
  const saved = d.id ? await prisma.clinic.update({ where: { id: d.id }, data }) : await prisma.clinic.create({ data });
  await recordAudit({ entityType: "Clinic", entityId: saved.id, action: d.id ? "UPDATE" : "CREATE", actorId: actor.id, actorRole: actor.role, newValue: data });
  return saved;
}
