import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { assertCareerConfig, lines } from "@/modules/career/descriptors";

export async function listPaths(user: CurrentUser, opts: { includeDrafts?: boolean } = {}) {
  assertCan(user, "carreira.view");
  return prisma.careerPath.findMany({
    where: opts.includeDrafts ? { status: { not: "ARQUIVADO" } } : { status: "VIGENTE" },
    orderBy: [{ status: "desc" }, { name: "asc" }],
    include: {
      family: { select: { id: true, name: true } },
      steps: { orderBy: { order: "asc" }, include: { position: { select: { id: true, title: true, level: true, isLeadership: true, _count: { select: { employees: { where: { status: { not: "DESLIGADO" } } } } } } } } },
    },
  });
}

const pathInput = z.object({ id: z.string().optional(), name: z.string().trim().min(3, "Nome da trilha").max(100), familyId: z.string().optional(), description: z.string().trim().max(500).optional(), sourceRef: z.string().trim().max(200).optional() });

export async function savePath(user: CurrentUser, raw: unknown) {
  assertCareerConfig(user);
  const d = pathInput.parse(raw);
  const data = { name: d.name, familyId: d.familyId || null, description: d.description ?? null, sourceRef: d.sourceRef ?? null };
  const saved = d.id ? await prisma.careerPath.update({ where: { id: d.id }, data }) : await prisma.careerPath.create({ data: { ...data, createdById: user.id } });
  await recordAudit({ entityType: "CareerPath", entityId: saved.id, action: d.id ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, newValue: data });
  return saved;
}

const stepInput = z.object({
  id: z.string().optional(), pathId: z.string(), positionId: z.string({ error: "Escolha o cargo" }).min(1, "Escolha o cargo"),
  minMonths: z.preprocess((v) => (v === undefined || v === "" ? null : Number(v)), z.number().int().min(0).max(240).nullable()),
  minScore: z.preprocess((v) => (v === undefined || v === "" ? null : Number(v)), z.number().int().min(0).max(100).nullable()),
  requirements: z.unknown().optional(), developable: z.unknown().optional(),
});

/** Passo da trilha (cargo + requisitos de progressão para chegar a ele). Novos passos entram no fim. */
export async function saveStep(user: CurrentUser, raw: unknown) {
  assertCareerConfig(user);
  const d = stepInput.parse(raw);
  const path = await prisma.careerPath.findUnique({ where: { id: d.pathId }, include: { steps: true } });
  if (!path) throw new NotFoundError("Trilha não encontrada");
  if (path.steps.some((s) => s.positionId === d.positionId && s.id !== d.id)) throw new ValidationError("Este cargo já está na trilha", { positionId: ["Repetido"] });
  const requirements = lines(d.requirements), developable = lines(d.developable);
  const both = requirements.filter((r) => developable.some((x) => x.toLowerCase() === r.toLowerCase()));
  if (both.length) throw new ValidationError(`“${both[0]}” não pode ser requisito mínimo e item do PDI ao mesmo tempo`, { requirements: ["Duplicado"] });
  const data = { positionId: d.positionId, minMonths: d.minMonths, minScore: d.minScore, requirements, developable };
  const saved = d.id ? await prisma.careerPathStep.update({ where: { id: d.id }, data }) : await prisma.careerPathStep.create({ data: { ...data, pathId: d.pathId, order: (path.steps.reduce((m, s) => Math.max(m, s.order), 0) || 0) + 1 } });
  await recordAudit({ entityType: "CareerPathStep", entityId: saved.id, action: d.id ? "UPDATE" : "CREATE", actorId: user.id, actorRole: user.role, newValue: data });
  return saved;
}

export async function removeStep(user: CurrentUser, stepId: string) {
  assertCareerConfig(user);
  const step = await prisma.careerPathStep.findUnique({ where: { id: stepId } });
  if (!step) throw new NotFoundError("Passo não encontrado");
  await prisma.$transaction(async (tx) => {
    await tx.careerPathStep.delete({ where: { id: stepId } });
    const rest = await tx.careerPathStep.findMany({ where: { pathId: step.pathId }, orderBy: { order: "asc" } });
    for (const [i, s] of rest.entries()) await tx.careerPathStep.update({ where: { id: s.id }, data: { order: 1000 + i } });
    for (const [i, s] of rest.entries()) await tx.careerPathStep.update({ where: { id: s.id }, data: { order: i + 1 } });
  });
  await recordAudit({ entityType: "CareerPathStep", entityId: stepId, action: "DELETE", actorId: user.id, actorRole: user.role });
}

export async function moveStep(user: CurrentUser, stepId: string, dir: "up" | "down") {
  assertCareerConfig(user);
  const step = await prisma.careerPathStep.findUnique({ where: { id: stepId } });
  if (!step) throw new NotFoundError("Passo não encontrado");
  const other = await prisma.careerPathStep.findFirst({ where: { pathId: step.pathId, order: dir === "up" ? step.order - 1 : step.order + 1 } });
  if (!other) return;
  await prisma.$transaction([
    prisma.careerPathStep.update({ where: { id: step.id }, data: { order: 0 } }),
    prisma.careerPathStep.update({ where: { id: other.id }, data: { order: step.order } }),
    prisma.careerPathStep.update({ where: { id: step.id }, data: { order: other.order } }),
  ]);
}

/** Vigente: exige ao menos 2 passos e o documento institucional de origem. */
export async function setPathStatus(user: CurrentUser, pathId: string, status: "RASCUNHO" | "VIGENTE" | "ARQUIVADO") {
  assertCareerConfig(user);
  const p = await prisma.careerPath.findUnique({ where: { id: pathId }, include: { steps: true } });
  if (!p) throw new NotFoundError("Trilha não encontrada");
  if (status === "VIGENTE") {
    if (p.steps.length < 2) throw new ValidationError("A trilha precisa de pelo menos 2 cargos");
    if (!p.sourceRef) throw new ValidationError("Informe o documento institucional que define a trilha antes de publicá-la", { sourceRef: ["Obrigatório para publicar"] });
  }
  await prisma.careerPath.update({ where: { id: pathId }, data: { status } });
  await recordAudit({ entityType: "CareerPath", entityId: pathId, action: "STATUS_CHANGE", actorId: user.id, actorRole: user.role, newValue: { status } });
}

/**
 * Rascunho a partir do catálogo: cargos ativos da família ordenados pelo nível (N1→N7).
 * É só um ponto de partida — fica como RASCUNHO e não aparece no portal nem nos indicadores até o RH
 * validar com o documento institucional e publicar.
 */
export async function draftFromFamily(user: CurrentUser, familyId: string) {
  assertCareerConfig(user);
  const fam = await prisma.careerTrack.findUnique({ where: { id: familyId }, include: { positions: { where: { active: true }, orderBy: [{ level: "asc" }, { title: "asc" }] } } });
  if (!fam) throw new NotFoundError("Família não encontrada");
  if (fam.positions.length < 2) throw new ValidationError("A família tem menos de 2 cargos no catálogo");
  const path = await prisma.careerPath.create({
    data: {
      name: `${fam.name} (rascunho do catálogo)`, familyId, createdById: user.id,
      description: "Gerado pela ordem de nível do catálogo — validar com o documento institucional, remover cargos que não fazem parte da progressão e informar os requisitos.",
      steps: { create: fam.positions.map((p, i) => ({ positionId: p.id, order: i + 1 })) },
    },
  });
  await recordAudit({ entityType: "CareerPath", entityId: path.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { draftFrom: fam.name } });
  return path;
}
