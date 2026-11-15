import { z } from "zod";
import { CandidateSource, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, can, type CurrentUser } from "@/lib/session";
import { nameSimilarity, normalizePhone, normalizeText, parseMoney, tidyName } from "@/lib/text";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordEvent } from "@/modules/recruitment/events";
import { candidateScopeWhere, jobScopeWhere } from "@/modules/recruitment/scope";
import { SOURCE_LABEL } from "@/modules/recruitment/constants";

export type DuplicateMatch = { id: string; fullName: string; phone: string | null; email: string | null; reason: string; lastJob?: string | null };

/** Erro especial: o formulário mostra os possíveis duplicados e pede confirmação. */
export class DuplicateCandidateError extends Error {
  constructor(public matches: DuplicateMatch[]) {
    super("Possível candidato já cadastrado");
  }
}

const candidateInput = z.object({
  fullName: z.string({ error: "Informe o nome completo" }).trim().min(3, "Informe o nome completo").max(150),
  phone: z.string({ error: "Informe o telefone" }).trim().min(1, "Informe o telefone"),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.email("E-mail inválido").max(160).optional()),
  jobOpeningId: z.string().min(1).optional(),
  desiredPositionId: z.string().min(1).optional(),
  source: z.enum(CandidateSource).optional(),
  notes: z.string().trim().max(2000).optional(),
  confirmNew: z.preprocess((v) => v === true || v === "true", z.boolean()).optional(),
  useExistingId: z.string().min(1).optional(),
});

/** Busca possíveis duplicados por telefone, e-mail e nome (exato ou semelhante). */
export async function findDuplicates(input: { fullName: string; phone?: string | null; email?: string | null }, excludeId?: string): Promise<DuplicateMatch[]> {
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  const name = normalizeText(input.fullName);
  const first = name.split(" ")[0] ?? "";
  const or: Prisma.CandidateWhereInput[] = [{ nameNormalized: name }];
  if (phone) or.push({ phoneNormalized: phone });
  if (email) or.push({ email: { equals: email, mode: "insensitive" } });
  if (first.length >= 3) or.push({ nameNormalized: { startsWith: first + " " } });
  const rows = await prisma.candidate.findMany({
    where: { OR: or, anonymizedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    take: 30,
    include: { applications: { orderBy: { createdAt: "desc" }, take: 1, include: { jobOpening: { include: { position: true } } } } },
  });
  const out: DuplicateMatch[] = [];
  for (const c of rows) {
    const reasons: string[] = [];
    if (phone && c.phoneNormalized === phone) reasons.push("mesmo telefone");
    if (email && c.email?.toLowerCase() === email) reasons.push("mesmo e-mail");
    if (c.nameNormalized === name) reasons.push("mesmo nome");
    else if (nameSimilarity(c.fullName, input.fullName) >= 0.67) reasons.push("nome parecido");
    if (reasons.length) out.push({ id: c.id, fullName: c.fullName, phone: c.phone, email: c.email, reason: reasons.join(", "), lastJob: c.applications[0]?.jobOpening.position.title ?? null });
  }
  return out;
}

async function ensureApplication(tx: Prisma.TransactionClient, user: CurrentUser, candidateId: string, jobOpeningId: string) {
  const job = await tx.jobOpening.findFirst({ where: { id: jobOpeningId, ...jobScopeWhere(user) }, include: { position: true } });
  if (!job) throw new ValidationError("Vaga não encontrada", { jobOpeningId: ["Vaga inválida"] });
  const existing = await tx.application.findUnique({ where: { candidateId_jobOpeningId: { candidateId, jobOpeningId } } });
  if (existing) return { app: existing, job, created: false };
  const app = await tx.application.create({ data: { candidateId, jobOpeningId, status: "TRIAGEM" } });
  await recordEvent(tx, { candidateId, applicationId: app.id, type: "CANDIDATURA", summary: `Vinculado à vaga ${job.code} — ${job.position.title}`, actorUserId: user.id });
  return { app, job, created: true };
}

export async function createCandidate(user: CurrentUser, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const data = candidateInput.parse(raw);
  const phone = normalizePhone(data.phone);
  if (!phone) throw new ValidationError("Telefone inválido", { phone: ["Informe DDD + número (ex.: 21 99999-9999)"] });

  // Usar cadastro existente (escolhido na tela de duplicidade)
  if (data.useExistingId) {
    const existing = await prisma.candidate.findFirst({ where: { id: data.useExistingId } });
    if (!existing) throw new NotFoundError("Candidato não encontrado");
    if (data.jobOpeningId) await prisma.$transaction((tx) => ensureApplication(tx, user, existing.id, data.jobOpeningId!));
    return { candidate: existing, reused: true };
  }

  if (!data.confirmNew) {
    const matches = await findDuplicates({ fullName: data.fullName, phone, email: data.email });
    if (matches.length) throw new DuplicateCandidateError(matches);
  }

  const candidate = await prisma.$transaction(async (tx) => {
    let desiredPositionId = data.desiredPositionId ?? null;
    if (data.jobOpeningId) {
      const job = await tx.jobOpening.findFirst({ where: { id: data.jobOpeningId, ...jobScopeWhere(user) } });
      if (!job) throw new ValidationError("Vaga não encontrada", { jobOpeningId: ["Vaga inválida"] });
      desiredPositionId = job.positionId; // cargo pretendido vem da vaga — sem redigitar
    }
    const c = await tx.candidate.create({
      data: {
        fullName: tidyName(data.fullName),
        nameNormalized: normalizeText(data.fullName),
        phone,
        phoneNormalized: phone,
        email: data.email?.toLowerCase() ?? null,
        desiredPositionId,
        source: data.source ?? "OUTRO",
        notes: data.notes ?? null,
        createdById: user.id,
      },
    });
    await recordEvent(tx, { candidateId: c.id, type: "CADASTRO", summary: `Candidato cadastrado (origem: ${SOURCE_LABEL[c.source]})`, actorUserId: user.id, details: data.confirmNew ? { duplicidadeConfirmada: true } : undefined });
    if (data.jobOpeningId) await ensureApplication(tx, user, c.id, data.jobOpeningId);
    return c;
  });
  await recordAudit({ entityType: "Candidate", entityId: candidate.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { fullName: candidate.fullName, source: candidate.source } });
  return { candidate, reused: false };
}

const candidateUpdate = z.object({
  fullName: z.string().trim().min(3).max(150).optional(),
  phone: z.string().trim().optional(),
  email: z.preprocess((v) => (v === "" ? null : v), z.email("E-mail inválido").nullable().optional()),
  desiredPositionId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  source: z.enum(CandidateSource).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function updateCandidate(user: CurrentUser, id: string, raw: unknown) {
  assertCan(user, "recrutamento.manage");
  const before = await prisma.candidate.findFirst({ where: { id, ...candidateScopeWhere(user) } });
  if (!before) throw new NotFoundError("Candidato não encontrado");
  const data = candidateUpdate.parse(raw);
  const patch: Prisma.CandidateUpdateInput = {};
  if (data.fullName) Object.assign(patch, { fullName: tidyName(data.fullName), nameNormalized: normalizeText(data.fullName) });
  if (data.phone !== undefined) {
    const p = normalizePhone(data.phone);
    if (data.phone && !p) throw new ValidationError("Telefone inválido", { phone: ["Informe DDD + número"] });
    Object.assign(patch, { phone: p, phoneNormalized: p });
  }
  if (data.email !== undefined) patch.email = data.email?.toLowerCase() ?? null;
  if (data.desiredPositionId !== undefined) patch.desiredPosition = data.desiredPositionId ? { connect: { id: data.desiredPositionId } } : { disconnect: true };
  if (data.source) patch.source = data.source;
  if (data.notes !== undefined) patch.notes = data.notes;
  const c = await prisma.$transaction(async (tx) => {
    const updated = await tx.candidate.update({ where: { id }, data: patch });
    const changed = Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined);
    await recordEvent(tx, { candidateId: id, type: "EDICAO", summary: `Cadastro editado (${changed.join(", ")})`, actorUserId: user.id });
    return updated;
  });
  await recordAudit({ entityType: "Candidate", entityId: id, action: "UPDATE", actorId: user.id, actorRole: user.role, previousValue: before, newValue: c });
  return c;
}

export async function addApplication(user: CurrentUser, candidateId: string, jobOpeningId: string) {
  assertCan(user, "recrutamento.manage");
  const c = await prisma.candidate.findFirst({ where: { id: candidateId } });
  if (!c) throw new NotFoundError("Candidato não encontrado");
  return prisma.$transaction((tx) => ensureApplication(tx, user, candidateId, jobOpeningId));
}

export async function listCandidates(user: CurrentUser, f: { q?: string; status?: string; jobId?: string; unitId?: string; page?: number } = {}) {
  assertCan(user, "candidatos.view");
  const take = 40;
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const where: Prisma.CandidateWhereInput = {
    AND: [
      candidateScopeWhere(user),
      { anonymizedAt: null },
      q ? { OR: [{ nameNormalized: { contains: normalizeText(q) } }, ...(digits && digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : []), { email: { contains: q, mode: "insensitive" as const } }] } : {},
      f.jobId ? { applications: { some: { jobOpeningId: f.jobId } } } : {},
      f.unitId ? { applications: { some: { jobOpening: { department: { unitId: f.unitId } } } } } : {},
      f.status ? { applications: { some: { status: f.status as never } } } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      skip: (page - 1) * take,
      include: {
        desiredPosition: { select: { title: true } },
        applications: {
          orderBy: { updatedAt: "desc" },
          include: {
            jobOpening: { select: { id: true, code: true, position: { select: { title: true } }, department: { select: { unit: { select: { name: true } } } } } },
            interviews: { orderBy: { scheduledAt: "desc" }, take: 1, select: { scheduledAt: true, hasTime: true, result: true } },
          },
        },
      },
    }),
    prisma.candidate.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getCandidate(user: CurrentUser, id: string) {
  assertCan(user, "candidatos.view");
  const c = await prisma.candidate.findFirst({
    where: { id, ...candidateScopeWhere(user) },
    include: {
      desiredPosition: { select: { id: true, title: true } },
      applications: {
        orderBy: { createdAt: "desc" },
        include: {
          jobOpening: { include: { position: true, department: { include: { unit: true } }, requestingManager: { select: { name: true } } } },
          interviews: { orderBy: { scheduledAt: "asc" }, include: { reason: true, interviewerUser: { select: { name: true } }, resultBy: { select: { name: true } } } },
          managerReviews: { orderBy: { requestedAt: "asc" }, include: { manager: { select: { name: true } }, decidedBy: { select: { name: true } }, reason: true } },
        },
      },
      events: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], include: { actorUser: { select: { name: true } } } },
    },
  });
  if (!c) throw new NotFoundError("Candidato não encontrado");
  const showSalary = can(user, "recrutamento.salarios");
  return {
    ...c,
    applications: c.applications.map((a) => (showSalary ? a : { ...a, offeredSalary: null, expectedSalary: null, lastSalary: null })),
    showSalary,
  };
}

const salaryInput = z.object({
  offeredSalary: z.preprocess((v) => (v === "" ? null : parseMoney(v)), z.number().min(0).nullable().optional()),
  expectedSalary: z.preprocess((v) => (v === "" ? null : parseMoney(v)), z.number().min(0).nullable().optional()),
  lastSalary: z.preprocess((v) => (v === "" ? null : parseMoney(v)), z.number().min(0).nullable().optional()),
  valuedBenefits: z.array(z.string().max(80)).max(20).optional(),
});

/** Diferença oferta × pretensão (positivo = candidato pede mais do que a oferta). */
export function salaryGap(offered: unknown, expected: unknown): { value: number; pct: number } | null {
  const o = offered === null || offered === undefined ? null : Number(offered);
  const e = expected === null || expected === undefined ? null : Number(expected);
  if (o === null || e === null || !Number.isFinite(o) || !Number.isFinite(e) || o === 0) return null;
  return { value: e - o, pct: ((e - o) / o) * 100 };
}

export async function updateSalary(user: CurrentUser, applicationId: string, raw: unknown) {
  assertCan(user, "recrutamento.salarios");
  assertCan(user, "recrutamento.manage");
  const app = await prisma.application.findFirst({ where: { id: applicationId, jobOpening: jobScopeWhere(user) } });
  if (!app) throw new NotFoundError("Candidatura não encontrada");
  const data = salaryInput.parse(raw);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.application.update({ where: { id: applicationId }, data });
    const gap = salaryGap(u.offeredSalary, u.expectedSalary);
    await recordEvent(tx, {
      candidateId: app.candidateId,
      applicationId,
      type: "SALARIO",
      summary: `Negociação salarial registrada${gap ? ` (diferença ${gap.value >= 0 ? "+" : ""}${gap.pct.toFixed(1)}%)` : ""}`,
      details: { oferta: u.offeredSalary, pretensao: u.expectedSalary, ultimo: u.lastSalary, beneficios: u.valuedBenefits },
      actorUserId: user.id,
    });
    return u;
  });
  return updated;
}
