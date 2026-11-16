import { z } from "zod";
import type { MovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, can, type CurrentUser } from "@/lib/session";
import { addDays, dateKey, localToDate, todayKey } from "@/lib/datetime";
import { parseMoney } from "@/lib/text";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { employeeScopeWhere } from "@/modules/people/scope";
import { getSetting } from "@/modules/settings/service";
import { resolveBase, resolvePositionSalary } from "@/modules/compensation/calc";
import { currentDescriptor } from "@/modules/career/descriptors";
import { bandPosition, eligibility, promotionTotal, PROMOTION_WEIGHTS, type ScoreKey } from "@/modules/career/rules";

const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const POSITION_MOVES: MovementType[] = ["ADMISSAO", "PROMOCAO", "MUDANCA_CARGO"];

export async function minScore() {
  return getSetting("carreira.nota_minima");
}

/** Desde quando está no cargo atual (última movimentação que levou ao cargo; sem ela, a admissão). */
export function positionSinceOf(e: { admissionDate: Date; positionId: string; movements: Array<{ type: MovementType; toPositionId: string | null; effectiveDate: Date }> }) {
  const m = e.movements.filter((x) => POSITION_MOVES.includes(x.type) && x.toPositionId === e.positionId).sort((a, b) => +b.effectiveDate - +a.effectiveDate)[0];
  return dateKey(m?.effectiveDate ?? e.admissionDate);
}

export async function bandFor(positionId: string, unitId: string, at = todayKey()) {
  const rows = await prisma.positionSalary.findMany({ where: { positionId } });
  const r = resolvePositionSalary(rows.map((t) => ({ unitId: t.unitId, baseSalary: Number(t.baseSalary), minSalary: N(t.minSalary), maxSalary: N(t.maxSalary), effectiveFrom: dateKey(t.effectiveFrom) })), unitId, at);
  return r ? { min: r.min, ref: r.value, max: r.max, scope: r.scope } : null;
}

/** Próximos passos a partir de um cargo, em todas as trilhas vigentes. */
export async function nextStepsFrom(positionId: string) {
  const paths = await prisma.careerPath.findMany({
    where: { status: "VIGENTE", steps: { some: { positionId } } },
    include: { steps: { orderBy: { order: "asc" }, include: { position: { select: { id: true, title: true, level: true } } } } },
  });
  return paths.map((p) => {
    const i = p.steps.findIndex((s) => s.positionId === positionId);
    return { path: { id: p.id, name: p.name, sourceRef: p.sourceRef }, steps: p.steps, index: i, next: p.steps[i + 1] ?? null };
  });
}

async function scoped(user: CurrentUser, id: string) {
  const e = await prisma.employee.findFirst({ where: { id, ...employeeScopeWhere(user) }, include: { department: { include: { unit: true } }, position: true, movements: true, salaries: true, manager: { select: { name: true } } } });
  if (!e) throw new NotFoundError("Colaborador não encontrado");
  return e;
}

/** Carreira do colaborador (visão do RH/gestor). Salário só para quem pode ver remuneração. */
export async function employeeCareer(user: CurrentUser, employeeId: string) {
  assertCan(user, "carreira.view");
  const e = await scoped(user, employeeId);
  const today = todayKey();
  const since = positionSinceOf(e);
  const [descriptor, paths, scores, pdis, movements, threshold] = await Promise.all([
    currentDescriptor(e.positionId), nextStepsFrom(e.positionId),
    prisma.promotionScore.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" } }),
    prisma.pDI.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" } }),
    prisma.movementHistory.findMany({ where: { employeeId }, orderBy: { effectiveDate: "asc" }, include: { fromPosition: { select: { title: true } }, toPosition: { select: { title: true } }, fromDepartment: { select: { name: true } }, toDepartment: { select: { name: true } }, recordedBy: { select: { name: true } }, jobOpening: { select: { code: true } } } }),
    minScore(),
  ]);
  const latest = scores[0]?.totalScore ?? null;
  const showSalary = can(user, "remuneracao.view");
  const base = resolveBase(N(e.baseSalary), e.salaries.map((s) => ({ amount: Number(s.amount), effectiveFrom: dateKey(s.effectiveFrom) })), today);
  const band = showSalary ? await bandFor(e.positionId, e.department.unitId) : null;
  const next = await Promise.all(paths.filter((p) => p.next).map(async (p) => ({
    ...p,
    eligibility: eligibility(since, today, p.next!.minMonths, latest, p.next!.minScore ?? threshold),
    descriptor: await currentDescriptor(p.next!.positionId),
    band: showSalary ? await bandFor(p.next!.positionId, e.department.unitId) : null,
  })));
  return {
    employee: e, since, descriptor, paths, next, scores, pdis, movements, threshold,
    salary: showSalary ? { base, band, position: bandPosition(base, band) } : null,
  };
}

/**
 * Portal do colaborador (arquitetura pronta, login ainda não habilitado): o que o próprio colaborador verá.
 * Sem salário individual de terceiros; faixa conforme política (portal.faixa_salarial).
 */
export async function portalView(employeeId: string) {
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, include: { department: { include: { unit: true } }, position: true, movements: true } });
  if (!e) throw new NotFoundError("Colaborador não encontrado");
  const policy = await getSetting("portal.faixa_salarial");
  const since = positionSinceOf(e);
  const [descriptor, paths, pdis, movements, threshold, latest] = await Promise.all([
    currentDescriptor(e.positionId), nextStepsFrom(e.positionId),
    prisma.pDI.findMany({ where: { employeeId, status: { not: "CANCELADO" } }, orderBy: { createdAt: "desc" } }),
    prisma.movementHistory.findMany({ where: { employeeId }, orderBy: { effectiveDate: "asc" }, include: { toPosition: { select: { title: true } }, toDepartment: { select: { name: true } } } }),
    minScore(),
    prisma.promotionScore.findFirst({ where: { employeeId }, orderBy: { createdAt: "desc" }, select: { totalScore: true } }),
  ]);
  const band = async (positionId: string) => {
    if (policy === "NAO_EXIBIR") return null;
    const b = await bandFor(positionId, e.department.unitId);
    if (!b) return null;
    return policy === "REFERENCIA" ? { ref: b.ref } : { min: b.min, ref: b.ref, max: b.max };
  };
  return {
    policy,
    employee: { name: e.fullName, position: e.position.title, level: e.position.level, department: e.department.name, unit: e.department.unit.name, admission: dateKey(e.admissionDate), since },
    descriptor, currentBand: await band(e.positionId),
    next: await Promise.all(paths.filter((p) => p.next).map(async (p) => {
      const d = await currentDescriptor(p.next!.positionId);
      return {
        path: p.path.name, steps: p.steps.map((s) => ({ title: s.position.title, current: s.positionId === e.positionId })),
        position: p.next!.position.title, level: p.next!.position.level,
        // requisitos mínimos (obrigatórios) × competências desenvolvíveis (PDI) — sempre separados
        mustHave: { progression: p.next!.requirements, descriptor: d?.minRequirements ?? [], education: d?.education ?? null, minExperienceMonths: d?.minExperienceMonths ?? null, minMonthsInRole: p.next!.minMonths, minScore: p.next!.minScore ?? threshold },
        develop: [...new Set([...p.next!.developable, ...(d?.competencies ?? []), ...(d?.technicalDevelopable ?? [])])],
        objectiveCriteria: eligibility(since, todayKey(), p.next!.minMonths, latest?.totalScore ?? null, p.next!.minScore ?? threshold),
        band: await band(p.next!.positionId),
      };
    })),
    pdis: pdis.map((p) => ({ id: p.id, gap: p.gapDescription, goal: p.developmentGoal, action: p.recommendedAction, due: p.dueDate ? dateKey(p.dueDate) : null, status: p.status, completion: p.completionPct })),
    history: movements.map((m) => ({ type: m.type, date: dateKey(m.effectiveDate), position: m.toPosition?.title ?? null, department: m.toDepartment?.name ?? null })),
    disclaimer: "A trilha mostra possibilidades de crescimento. Promoção não é automática: depende de vaga, dos requisitos mínimos, da avaliação e da aprovação da empresa.",
  };
}

// ═════════ Movimentações internas ═════════

const moveInput = z.object({
  type: z.enum(["PROMOCAO", "MUDANCA_CARGO", "TRANSFERENCIA_DEPARTAMENTO", "TRANSFERENCIA_UNIDADE", "MUDANCA_GESTOR"]),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  toPositionId: z.string().optional(), toDepartmentId: z.string().optional(), toManagerId: z.string().optional(),
  newSalary: z.preprocess((v) => (v === undefined || v === "" ? null : parseMoney(v)), z.number().positive("Salário inválido").nullable()),
  reason: z.string({ error: "Informe o motivo" }).trim().min(5, "Descreva o motivo da movimentação").max(1000),
  jobOpeningId: z.string().optional(),
  bandJustification: z.string().trim().max(500).optional(),
});

/**
 * Promoção, mudança de cargo, transferência ou troca de gestor — com histórico, salário (opcional) e,
 * se informada, a vaga preenchida internamente. Promoção exige cargo de nível maior ou próximo passo de trilha vigente.
 */
export async function registerMovement(user: CurrentUser, employeeId: string, raw: unknown) {
  assertCan(user, "carreira.movimentar");
  const d = moveInput.parse(raw);
  const e = await scoped(user, employeeId);
  if (e.status === "DESLIGADO") throw new ValidationError("Colaborador desligado");
  if (d.effectiveDate < dateKey(e.admissionDate)) throw new ValidationError("Data anterior à admissão", { effectiveDate: ["Antes da admissão"] });
  if (d.effectiveDate > addDays(todayKey(), 60)) throw new ValidationError("Data muito distante (máximo 60 dias à frente)", { effectiveDate: ["Muito distante"] });
  const toPositionId = d.toPositionId || e.positionId, toDepartmentId = d.toDepartmentId || e.departmentId, toManagerId = d.toManagerId || e.managerId;
  const [toPos, toDept] = await Promise.all([prisma.position.findUniqueOrThrow({ where: { id: toPositionId } }), prisma.department.findUniqueOrThrow({ where: { id: toDepartmentId } })]);
  if (["PROMOCAO", "MUDANCA_CARGO"].includes(d.type) && toPositionId === e.positionId) throw new ValidationError("Escolha o novo cargo", { toPositionId: ["Mesmo cargo"] });
  if (d.type === "TRANSFERENCIA_DEPARTAMENTO" && toDepartmentId === e.departmentId) throw new ValidationError("Escolha o novo departamento", { toDepartmentId: ["Mesmo departamento"] });
  if (d.type === "TRANSFERENCIA_UNIDADE" && toDept.unitId === e.department.unitId) throw new ValidationError("Escolha um departamento de outra unidade", { toDepartmentId: ["Mesma unidade"] });
  if (d.type === "MUDANCA_GESTOR" && toManagerId === e.managerId) throw new ValidationError("Escolha o novo gestor", { toManagerId: ["Mesmo gestor"] });
  if (user.role === "RH" && user.unitId && toDept.unitId !== user.unitId) throw new ValidationError("Destino fora da sua unidade — peça ao RH corporativo", { toDepartmentId: ["Fora da unidade"] });
  if (d.type === "PROMOCAO") {
    const inPath = (await nextStepsFrom(e.positionId)).some((p) => p.next?.positionId === toPositionId);
    const higher = Number(toPos.level.slice(1)) > Number(e.position.level.slice(1));
    if (!inPath && !higher) throw new ValidationError("Promoção exige cargo de nível superior ou o próximo passo de uma trilha vigente — use “mudança de cargo”", { toPositionId: ["Não é promoção"] });
  }
  if (d.newSalary !== null) {
    assertCan(user, "remuneracao.manage");
    const band = await bandFor(toPositionId, toDept.unitId, d.effectiveDate);
    const pos = bandPosition(d.newSalary, band);
    if (pos && pos.where !== "DENTRO" && !d.bandJustification) throw new ValidationError(`Salário ${pos.where === "ABAIXO" ? "abaixo do mínimo" : "acima do máximo"} da faixa do cargo — justifique a exceção`, { bandJustification: ["Obrigatório fora da faixa"] });
  }
  let job: { id: string; headcount: number; status: string; positionId: string } | null = null;
  if (d.jobOpeningId) {
    job = await prisma.jobOpening.findUnique({ where: { id: d.jobOpeningId }, select: { id: true, headcount: true, status: true, positionId: true } });
    if (!job || !["ABERTA", "PAUSADA"].includes(job.status)) throw new ValidationError("Vaga inexistente ou já encerrada", { jobOpeningId: ["Vaga inválida"] });
    if (job.positionId !== toPositionId) throw new ValidationError("A vaga é de outro cargo", { jobOpeningId: ["Cargo diferente"] });
  }
  const effective = localToDate(d.effectiveDate);
  const mv = await prisma.$transaction(async (tx) => {
    const m = await tx.movementHistory.create({
      data: {
        employeeId, type: d.type, effectiveDate: effective, fromPositionId: e.positionId, toPositionId, fromDepartmentId: e.departmentId, toDepartmentId, fromManagerId: e.managerId, toManagerId,
        reason: d.reason + (d.bandJustification ? ` — exceção de faixa: ${d.bandJustification}` : ""), jobOpeningId: job?.id ?? null, recordedById: user.id,
      },
    });
    if (d.effectiveDate <= todayKey()) await tx.employee.update({ where: { id: employeeId }, data: { positionId: toPositionId, departmentId: toDepartmentId, managerId: toManagerId } });
    if (d.newSalary !== null) await tx.employeeSalary.create({ data: { employeeId, amount: d.newSalary, effectiveFrom: effective, reason: `${d.type === "PROMOCAO" ? "Promoção" : "Movimentação"}: ${toPos.title}`, createdById: user.id } });
    if (job) {
      const fills = await tx.movementHistory.count({ where: { jobOpeningId: job.id } });
      const hires = await tx.application.count({ where: { jobOpeningId: job.id, status: "CONTRATADO" } });
      if (fills + hires >= job.headcount) await tx.jobOpening.update({ where: { id: job.id }, data: { status: "PREENCHIDA", closedAt: effective } });
    }
    return m;
  });
  await recordAudit({ entityType: "Employee", entityId: employeeId, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: { movement: d.type, toPositionId, toDepartmentId, effectiveDate: d.effectiveDate, salary: d.newSalary !== null ? "[restrito]" : undefined, jobOpeningId: job?.id } });
  return mv;
}

/** Aplica movimentações com data futura quando a data chega (rotina diária). */
export async function applyDueMovements(today = todayKey()) {
  const due = await prisma.movementHistory.findMany({ where: { type: { in: ["PROMOCAO", "MUDANCA_CARGO", "TRANSFERENCIA_DEPARTAMENTO", "TRANSFERENCIA_UNIDADE", "MUDANCA_GESTOR"] }, effectiveDate: { gte: localToDate(addDays(today, -7)), lte: localToDate(today) } }, orderBy: { effectiveDate: "asc" }, include: { employee: true } });
  let n = 0;
  for (const m of due) {
    const latest = await prisma.movementHistory.findFirst({ where: { employeeId: m.employeeId, effectiveDate: { lte: localToDate(today) }, type: { not: "DESLIGAMENTO" } }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }] });
    if (latest?.id !== m.id || m.employee.status === "DESLIGADO") continue;
    if (m.employee.positionId !== m.toPositionId || m.employee.departmentId !== m.toDepartmentId || m.employee.managerId !== m.toManagerId) {
      await prisma.employee.update({ where: { id: m.employeeId }, data: { positionId: m.toPositionId ?? undefined, departmentId: m.toDepartmentId ?? undefined, managerId: m.toManagerId } });
      n++;
    }
  }
  return n;
}

// ═════════ Avaliação de promoção (RH-CAR-01) ═════════

const pct = z.coerce.number().min(0, "0 a 100").max(100, "0 a 100");
const scoreInput = z.object({ cycle: z.string().trim().min(4, "Informe o ciclo (ex.: 2026-S2)").max(20), performance: pct, competency: pct, behavior: pct, culturalFit: pct, leadershipPotential: pct, pdiCompletion: pct, conduct: pct, committeeMinutes: z.string().trim().max(3000).optional(), decision: z.string().trim().max(300).optional() });

export async function registerPromotionScore(user: CurrentUser, employeeId: string, raw: unknown) {
  assertCan(user, "carreira.movimentar");
  await scoped(user, employeeId);
  const d = scoreInput.parse(raw);
  const total = promotionTotal(Object.fromEntries((Object.keys(PROMOTION_WEIGHTS) as ScoreKey[]).map((k) => [k, d[k]])) as Record<ScoreKey, number>);
  const threshold = await minScore();
  if (await prisma.promotionScore.findFirst({ where: { employeeId, cycle: d.cycle } })) throw new ValidationError("Já existe avaliação neste ciclo", { cycle: ["Ciclo repetido"] });
  const row = await prisma.promotionScore.create({ data: { employeeId, cycle: d.cycle, performance: d.performance, competency: d.competency, behavior: d.behavior, culturalFit: d.culturalFit, leadershipPotential: d.leadershipPotential, pdiCompletion: d.pdiCompletion, conduct: d.conduct, totalScore: total, committeeRequired: total >= threshold, committeeMinutes: d.committeeMinutes ?? null, decision: d.decision ?? null, evaluatedById: user.id } });
  await recordAudit({ entityType: "PromotionScore", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: { employeeId, cycle: d.cycle, total } });
  return row;
}

// ═════════ PDI — competências desenvolvíveis ═════════

const pdiInput = z.object({ gapDescription: z.string({ error: "Informe a competência" }).trim().min(3, "Informe a competência a desenvolver").max(500), developmentGoal: z.string().trim().min(3, "Informe o objetivo").max(1000), recommendedAction: z.string().trim().min(3, "Informe a ação").max(1000), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export async function createPdi(user: CurrentUser, employeeId: string, raw: unknown) {
  assertCan(user, "carreira.movimentar");
  await scoped(user, employeeId);
  const d = pdiInput.parse(raw);
  const row = await prisma.pDI.create({ data: { employeeId, origin: "PLANO_CARREIRA", gapDescription: d.gapDescription, developmentGoal: d.developmentGoal, recommendedAction: d.recommendedAction, dueDate: d.dueDate ? localToDate(d.dueDate) : null } });
  await recordAudit({ entityType: "PDI", entityId: row.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: d });
  return row;
}

export async function updatePdi(user: CurrentUser, pdiId: string, raw: unknown) {
  assertCan(user, "carreira.movimentar");
  const d = z.object({ status: z.enum(["ABERTO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]), completionPct: z.coerce.number().min(0).max(100), checkpointNotes: z.string().trim().max(2000).optional() }).parse(raw);
  const p = await prisma.pDI.findFirst({ where: { id: pdiId, employee: employeeScopeWhere(user) } });
  if (!p) throw new NotFoundError("PDI não encontrado");
  await prisma.pDI.update({ where: { id: pdiId }, data: { status: d.status, completionPct: d.status === "CONCLUIDO" ? 100 : d.completionPct, checkpointNotes: d.checkpointNotes ?? p.checkpointNotes } });
  await recordAudit({ entityType: "PDI", entityId: pdiId, action: "UPDATE", actorId: user.id, actorRole: user.role, newValue: d });
}
