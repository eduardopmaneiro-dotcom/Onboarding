import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, ForbiddenError, type CurrentUser } from "@/lib/session";
import { localToDate, todayKey } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { storeDocument } from "@/modules/documents/service";

export function assertCareerConfig(user: CurrentUser) {
  assertCan(user, "carreira.manage");
  if (user.role !== "ADMIN" && user.unitId) throw new ForbiddenError("Descritivos e trilhas são corporativos — peça ao RH corporativo");
}

/** Uma linha por item (listas digitadas em caixa de texto). */
export const lines = (v: unknown) => (typeof v === "string" ? v.split(/\r?\n/).map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean) : Array.isArray(v) ? v.map(String) : []);

export async function currentDescriptor(positionId: string) {
  return prisma.jobDescription.findFirst({ where: { positionId, status: "VIGENTE" }, include: { reportsTo: { select: { id: true, title: true } } } });
}

export async function subordinates(positionId: string) {
  return prisma.position.findMany({ where: { active: true, descriptions: { some: { status: "VIGENTE", reportsToId: positionId } } }, orderBy: { title: "asc" }, select: { id: true, title: true, level: true } });
}

export async function positionDossier(user: CurrentUser, positionId: string) {
  assertCan(user, "carreira.view");
  const position = await prisma.position.findUnique({ where: { id: positionId }, include: { careerTrack: { include: { stages: { include: { requirements: true }, orderBy: { order: "asc" } } } } } });
  if (!position) throw new NotFoundError("Cargo não encontrado");
  const [versions, subs, steps, employees, attachments] = await Promise.all([
    prisma.jobDescription.findMany({ where: { positionId }, orderBy: { version: "desc" }, include: { reportsTo: { select: { id: true, title: true } } } }),
    subordinates(positionId),
    prisma.careerPathStep.findMany({ where: { positionId }, include: { path: { include: { steps: { orderBy: { order: "asc" }, include: { position: { select: { id: true, title: true, level: true } } } } } } } }),
    prisma.employee.count({ where: { positionId, status: { not: "DESLIGADO" } } }),
    prisma.document.findMany({ where: { ownerType: "JobDescription", ownerId: positionId, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, originalName: true, createdAt: true, category: true } }),
  ]);
  return { position, versions, current: versions.find((v) => v.status === "VIGENTE") ?? null, draft: versions.find((v) => v.status === "RASCUNHO") ?? null, subordinates: subs, paths: steps.map((s) => s.path), employees, attachments };
}

const EDU = ["NAO_EXIGIDA", "FUNDAMENTAL_INCOMPLETO", "FUNDAMENTAL", "MEDIO_INCOMPLETO", "MEDIO", "TECNICO", "SUPERIOR_INCOMPLETO", "SUPERIOR", "POS_GRADUACAO"] as const;
const descriptorInput = z.object({
  objective: z.string().trim().max(3000).optional(),
  responsibilities: z.unknown().optional(), minRequirements: z.unknown().optional(), technicalRequired: z.unknown().optional(), technicalDevelopable: z.unknown().optional(), competencies: z.unknown().optional(),
  education: z.enum(EDU).optional(), educationNote: z.string().trim().max(200).optional(),
  minExperienceMonths: z.preprocess((v) => (v === undefined || v === "" ? null : Number(v)), z.number().int().min(0).max(600).nullable()),
  experienceNote: z.string().trim().max(300).optional(),
  reportsToId: z.string().optional(),
  sourceRef: z.string().trim().max(200).optional(),
});

/** Salva o rascunho (cria nova versão a partir da vigente quando não há rascunho). */
export async function saveDescriptorDraft(user: CurrentUser, positionId: string, raw: unknown) {
  assertCareerConfig(user);
  const d = descriptorInput.parse(raw);
  if (d.reportsToId === positionId) throw new ValidationError("O cargo não pode ser superior de si mesmo", { reportsToId: ["Inválido"] });
  const data = {
    objective: d.objective ?? null, responsibilities: lines(d.responsibilities), minRequirements: lines(d.minRequirements), technicalRequired: lines(d.technicalRequired),
    technicalDevelopable: lines(d.technicalDevelopable), competencies: lines(d.competencies), education: d.education ?? null, educationNote: d.educationNote ?? null,
    minExperienceMonths: d.minExperienceMonths, experienceNote: d.experienceNote ?? null, reportsToId: d.reportsToId || null, sourceRef: d.sourceRef ?? null,
  };
  // requisito mínimo e competência desenvolvível não podem ser o mesmo item
  const dup = data.minRequirements.filter((r) => data.competencies.some((c) => c.toLowerCase() === r.toLowerCase()) || data.technicalDevelopable.some((c) => c.toLowerCase() === r.toLowerCase()));
  if (dup.length) throw new ValidationError(`“${dup[0]}” está como requisito mínimo e como item desenvolvível — escolha um`, { minRequirements: ["Item duplicado"] });
  const draft = await prisma.jobDescription.findFirst({ where: { positionId, status: "RASCUNHO" } });
  const saved = draft
    ? await prisma.jobDescription.update({ where: { id: draft.id }, data })
    : await prisma.jobDescription.create({ data: { ...data, positionId, version: ((await prisma.jobDescription.aggregate({ where: { positionId }, _max: { version: true } }))._max.version ?? 0) + 1, createdById: user.id } });
  await recordAudit({ entityType: "JobDescription", entityId: saved.id, action: draft ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, newValue: { positionId, version: saved.version } });
  return saved;
}

/** Publica o rascunho como vigente (a versão anterior é arquivada). Exige objetivo, responsabilidades e origem. */
export async function publishDescriptor(user: CurrentUser, positionId: string, raw: unknown) {
  assertCareerConfig(user);
  const { effectiveFrom } = z.object({ effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(todayKey()) }).parse(raw ?? {});
  const draft = await prisma.jobDescription.findFirst({ where: { positionId, status: "RASCUNHO" } });
  if (!draft) throw new ValidationError("Não há rascunho para publicar");
  const missing = [!draft.objective && "objetivo", !draft.responsibilities.length && "responsabilidades", !draft.minRequirements.length && "requisitos mínimos", !draft.sourceRef && "documento institucional de origem"].filter(Boolean);
  if (missing.length) throw new ValidationError(`Para publicar, preencha: ${missing.join(", ")}`);
  await prisma.$transaction([
    prisma.jobDescription.updateMany({ where: { positionId, status: "VIGENTE" }, data: { status: "ARQUIVADO" } }),
    prisma.jobDescription.update({ where: { id: draft.id }, data: { status: "VIGENTE", effectiveFrom: localToDate(effectiveFrom), approvedById: user.id, approvedAt: new Date() } }),
  ]);
  await recordAudit({ entityType: "JobDescription", entityId: draft.id, action: "APPROVE", actorId: user.id, actorRole: user.role, newValue: { positionId, version: draft.version, effectiveFrom } });
}

export async function attachDescriptorFile(user: CurrentUser, positionId: string, file: File) {
  assertCareerConfig(user);
  if (!(await prisma.position.findUnique({ where: { id: positionId } }))) throw new NotFoundError("Cargo não encontrado");
  return storeDocument(user, { ownerType: "JobDescription", ownerId: positionId, category: "descritivo", file, classification: "INTERNO" });
}

/** Catálogo de competências (para o perfil do candidato e o PDI): união dos descritivos vigentes. */
export async function competencyCatalog() {
  const rows = await prisma.jobDescription.findMany({ where: { status: "VIGENTE" }, select: { competencies: true, technicalDevelopable: true } });
  return [...new Set(rows.flatMap((r) => [...r.competencies, ...r.technicalDevelopable]))].sort((a, b) => a.localeCompare(b));
}
