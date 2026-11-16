/**
 * Potencial de candidatos e banco de talentos: compara o perfil do candidato (experiências ligadas ao
 * catálogo, escolaridade, competências e aprovações anteriores do RH) com o descritivo e as trilhas.
 */
import { z } from "zod";
import type { EducationLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { candidateScopeWhere } from "@/modules/recruitment/scope";
import { candidateFit } from "@/modules/career/rules";

const EDU = ["NAO_EXIGIDA", "FUNDAMENTAL_INCOMPLETO", "FUNDAMENTAL", "MEDIO_INCOMPLETO", "MEDIO", "TECNICO", "SUPERIOR_INCOMPLETO", "SUPERIOR", "POS_GRADUACAO"] as const;

async function scopedCandidate(user: CurrentUser, id: string) {
  const c = await prisma.candidate.findFirst({ where: { id, anonymizedAt: null, ...candidateScopeWhere(user) } });
  if (!c) throw new NotFoundError("Candidato não encontrado");
  return c;
}

export async function saveCandidateProfile(user: CurrentUser, candidateId: string, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  await scopedCandidate(user, candidateId);
  const d = z.object({ education: z.enum(EDU).optional(), competencies: z.unknown().optional() }).parse(raw);
  const comps = typeof d.competencies === "string" ? d.competencies.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : Array.isArray(d.competencies) ? d.competencies.map(String) : [];
  await prisma.candidate.update({ where: { id: candidateId }, data: { education: d.education ?? null, competencies: [...new Set(comps)] } });
  await recordAudit({ entityType: "Candidate", entityId: candidateId, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: { education: d.education, competencies: comps } });
}

const expInput = z.object({ positionId: z.string().optional(), roleTitle: z.string({ error: "Informe a função" }).trim().min(2, "Informe a função exercida").max(100), company: z.string().trim().max(100).optional(), months: z.preprocess((v) => (v === undefined || v === "" ? null : Number(v)), z.number().int().min(0).max(600).nullable()) });

export async function addExperience(user: CurrentUser, candidateId: string, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  await scopedCandidate(user, candidateId);
  const d = expInput.parse(raw);
  return prisma.candidateExperience.create({ data: { candidateId, positionId: d.positionId || null, roleTitle: d.roleTitle, company: d.company ?? null, months: d.months, createdById: user.id } });
}

export async function removeExperience(user: CurrentUser, id: string) {
  assertCan(user, "recrutamento.manage");
  const x = await prisma.candidateExperience.findUnique({ where: { id } });
  if (!x) throw new NotFoundError("Experiência não encontrada");
  await scopedCandidate(user, x.candidateId);
  await prisma.candidateExperience.delete({ where: { id } });
}

type Target = { positionId: string; title: string; feederIds: string[]; familyIds: string[]; education: EducationLevel | null; minExperienceMonths: number | null; competencies: string[]; hasDescriptor: boolean };

/** Alvos possíveis: cargos ativos com o que define compatibilidade (descritivo vigente, trilhas e família). */
async function targets(positionIds?: string[]): Promise<Target[]> {
  const [positions, paths, descs] = await Promise.all([
    prisma.position.findMany({ where: { active: true, ...(positionIds ? { id: { in: positionIds } } : {}) }, select: { id: true, title: true, careerTrackId: true } }),
    prisma.careerPath.findMany({ where: { status: "VIGENTE" }, include: { steps: { orderBy: { order: "asc" } } } }),
    prisma.jobDescription.findMany({ where: { status: "VIGENTE" } }),
  ]);
  const all = await prisma.position.findMany({ where: { active: true }, select: { id: true, careerTrackId: true } });
  return positions.map((p) => {
    const feeders = paths.flatMap((path) => { const i = path.steps.findIndex((s) => s.positionId === p.id); return i > 0 ? [path.steps[i - 1].positionId] : []; });
    const d = descs.find((x) => x.positionId === p.id);
    return {
      positionId: p.id, title: p.title, feederIds: feeders, familyIds: p.careerTrackId ? all.filter((x) => x.careerTrackId === p.careerTrackId).map((x) => x.id) : [p.id],
      education: d?.education ?? null, minExperienceMonths: d?.minExperienceMonths ?? null, competencies: [...(d?.competencies ?? []), ...(d?.technicalDevelopable ?? []), ...(d?.technicalRequired ?? [])], hasDescriptor: !!d,
    };
  });
}

async function profiles(where: object) {
  const cands = await prisma.candidate.findMany({
    where: { anonymizedAt: null, employments: { none: { status: { not: "DESLIGADO" } } }, ...where },
    include: {
      experiences: true,
      applications: { include: { jobOpening: { select: { positionId: true } }, interviews: { select: { result: true, status: true } } } },
      talentEntries: true,
    },
  });
  return cands.map((c) => ({
    c,
    input: {
      experiences: c.experiences.map((e) => ({ positionId: e.positionId, months: e.months })),
      education: c.education, competencies: c.competencies,
      rhApprovedFor: c.applications.filter((a) => a.interviews.some((i) => i.result === "APROVADO" && i.status !== "CANCELADA") && a.status !== "CONTRATADO").map((a) => a.jobOpening.positionId),
    },
  }));
}

/** Cargos compatíveis com um candidato (inclusive diferentes do que ele disputou). */
export async function matchesForCandidate(user: CurrentUser, candidateId: string) {
  assertCan(user, "candidatos.view");
  await scopedCandidate(user, candidateId);
  const [[p], ts] = await Promise.all([profiles({ id: candidateId }), targets()]);
  if (!p) return [];
  return ts.map((t) => ({ positionId: t.positionId, title: t.title, hasDescriptor: t.hasDescriptor, ...candidateFit(p.input, t), inPool: p.c.talentEntries.some((e) => e.positionId === t.positionId && e.status !== "ARQUIVADO") }))
    .filter((m) => m.level)
    .sort((a, b) => (a.level === b.level ? b.relevantMonths - a.relevantMonths : a.level === "FORTE" ? -1 : 1));
}

/** Candidatos compatíveis com um cargo (para a vaga aberta e o banco de talentos). */
export async function matchesForPosition(user: CurrentUser, positionId: string) {
  assertCan(user, "candidatos.view");
  const [ts, ps] = await Promise.all([targets([positionId]), profiles(candidateScopeWhere(user))]);
  const t = ts[0];
  if (!t) throw new NotFoundError("Cargo não encontrado");
  return ps.map((p) => ({ candidateId: p.c.id, name: p.c.fullName, phone: p.c.phone, ...candidateFit(p.input, t), pool: p.c.talentEntries.find((e) => e.positionId === positionId) ?? null }))
    .filter((m) => m.level || m.pool)
    .sort((a, b) => (a.level === b.level ? b.relevantMonths - a.relevantMonths : a.level === "FORTE" ? -1 : 1));
}

export async function addToTalentPool(user: CurrentUser, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const d = z.object({ candidateId: z.string(), positionId: z.string({ error: "Escolha o cargo" }).min(1, "Escolha o cargo"), reason: z.string({ error: "Informe o motivo" }).trim().min(5, "Explique por que o candidato é compatível").max(500) }).parse(raw);
  await scopedCandidate(user, d.candidateId);
  const existing = await prisma.talentPoolEntry.findUnique({ where: { candidateId_positionId: { candidateId: d.candidateId, positionId: d.positionId } } });
  if (existing && existing.status !== "ARQUIVADO") throw new ValidationError("Candidato já está no banco de talentos para este cargo");
  const row = existing
    ? await prisma.talentPoolEntry.update({ where: { id: existing.id }, data: { status: "ATIVO", reason: d.reason } })
    : await prisma.talentPoolEntry.create({ data: { ...d, createdById: user.id } });
  await prisma.candidateEvent.create({ data: { candidateId: d.candidateId, type: "OBSERVACAO", summary: `Incluído no banco de talentos: ${(await prisma.position.findUniqueOrThrow({ where: { id: d.positionId } })).title} — ${d.reason}`, actorUserId: user.id } });
  await recordAudit({ entityType: "TalentPoolEntry", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: d });
  return row;
}

export async function setTalentStatus(user: CurrentUser, id: string, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const d = z.object({ status: z.enum(["ATIVO", "CONTATADO", "ARQUIVADO"]), note: z.string().trim().max(300).optional() }).parse(raw);
  const e = await prisma.talentPoolEntry.findUnique({ where: { id } });
  if (!e) throw new NotFoundError("Registro não encontrado");
  await scopedCandidate(user, e.candidateId);
  await prisma.talentPoolEntry.update({ where: { id }, data: { status: d.status, note: d.note ?? e.note } });
}

export async function listTalentPool(user: CurrentUser, f: { cargo?: string; status?: string } = {}) {
  assertCan(user, "candidatos.view");
  return prisma.talentPoolEntry.findMany({
    where: { candidate: { anonymizedAt: null, ...candidateScopeWhere(user) }, ...(f.cargo ? { positionId: f.cargo } : {}), status: f.status === "TODOS" ? undefined : ((f.status as "ATIVO") ?? { not: "ARQUIVADO" }) },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { candidate: { select: { id: true, fullName: true, phone: true, education: true } }, position: { select: { id: true, title: true } } },
  });
}
