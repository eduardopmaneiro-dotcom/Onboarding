/**
 * Indicadores de carreira: elegibilidade (critérios objetivos — não é promoção), movimentações internas,
 * promoções, distribuição salarial na faixa, potenciais sucessores e vagas preenchidas internamente.
 */
import type { MovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan, can, type CurrentUser } from "@/lib/session";
import { dateKey, todayKey } from "@/lib/datetime";
import { makePeriod, type Granularity } from "@/modules/analytics/periods";
import { median, rate } from "@/modules/analytics/metrics";
import { employeeScopeWhere } from "@/modules/people/scope";
import { jobScopeWhere } from "@/modules/recruitment/scope";
import { headcount } from "@/modules/people/metrics";
import { loadEmployees } from "@/modules/people/report";
import { resolveBase } from "@/modules/compensation/calc";
import { bandPosition, eligibility, type Eligibility } from "@/modules/career/rules";
import { bandFor, minScore, positionSinceOf } from "@/modules/career/people";

export type CareerQuery = { gran?: string; ref?: string; unidade?: string; familia?: string };
export const MOVE_LABEL: Partial<Record<MovementType, string>> = { PROMOCAO: "Promoções", MUDANCA_CARGO: "Mudanças de cargo", TRANSFERENCIA_DEPARTAMENTO: "Transferências de departamento", TRANSFERENCIA_UNIDADE: "Transferências de unidade", MUDANCA_GESTOR: "Trocas de gestor", ALTERACAO_SALARIAL: "Alterações salariais" };
const INTERNAL: MovementType[] = ["PROMOCAO", "MUDANCA_CARGO", "TRANSFERENCIA_DEPARTAMENTO", "TRANSFERENCIA_UNIDADE", "MUDANCA_GESTOR", "ALTERACAO_SALARIAL"];
const RANK: Record<Eligibility["status"], number> = { ELEGIVEL: 0, FALTA_AVALIACAO: 1, NOTA_ABAIXO: 2, FALTA_TEMPO: 3 };

export async function careerIndicators(user: CurrentUser, q: CareerQuery) {
  assertCan(user, "carreira.view");
  const gran: Granularity = (["semana", "mes", "trimestre", "ano"] as const).includes(q.gran as Granularity) ? (q.gran as Granularity) : "ano";
  const period = makePeriod(gran, q.ref && /^\d{4}-\d{2}-\d{2}$/.test(q.ref) ? q.ref : todayKey());
  const today = todayKey();
  const inP = (k: string) => k >= period.from && k < period.to;
  const showSalary = can(user, "remuneracao.view");
  const [threshold, paths, emps] = await Promise.all([
    minScore(),
    prisma.careerPath.findMany({ where: { status: "VIGENTE", ...(q.familia ? { familyId: q.familia } : {}) }, include: { steps: { orderBy: { order: "asc" }, include: { position: { select: { id: true, title: true, isLeadership: true, careerTrackId: true } } } } } }),
    prisma.employee.findMany({
      where: { ...employeeScopeWhere(user), ...(q.unidade ? { department: { unitId: q.unidade } } : {}), ...(q.familia ? { position: { careerTrackId: q.familia } } : {}) },
      include: { movements: true, salaries: true, promotionScores: { orderBy: { createdAt: "desc" }, take: 1 }, position: { select: { id: true, title: true, careerTrackId: true } }, department: { select: { unitId: true, name: true, unit: { select: { name: true } } } } },
    }),
  ]);
  const active = emps.filter((e) => e.status !== "DESLIGADO");

  // Elegibilidade: melhor situação entre as trilhas vigentes em que o cargo atual tem próximo passo
  const elig = active.map((e) => {
    const since = positionSinceOf(e);
    const score = e.promotionScores[0]?.totalScore ?? null;
    const options = paths.flatMap((p) => { const i = p.steps.findIndex((s) => s.positionId === e.positionId); const nx = i >= 0 ? p.steps[i + 1] : undefined; return nx ? [{ path: p.name, next: nx.position.title, nextId: nx.positionId, e: eligibility(since, today, nx.minMonths, score, nx.minScore ?? threshold) }] : []; });
    const best = options.sort((a, b) => RANK[a.e.status] - RANK[b.e.status])[0] ?? null;
    return { id: e.id, name: e.fullName, position: e.position.title, positionId: e.positionId, unit: e.department.unit.name, since, score, best };
  });
  const eligCounts = { ELEGIVEL: 0, FALTA_AVALIACAO: 0, NOTA_ABAIXO: 0, FALTA_TEMPO: 0, SEM_TRILHA: 0 };
  for (const x of elig) eligCounts[x.best ? x.best.e.status : "SEM_TRILHA"]++;

  // Movimentações internas e promoções no período
  const moves = emps.flatMap((e) => e.movements.filter((m) => INTERNAL.includes(m.type) && inP(dateKey(m.effectiveDate))).map((m) => ({ ...m, employee: e.fullName })));
  const byType = INTERNAL.map((t) => ({ type: t, label: MOVE_LABEL[t]!, value: moves.filter((m) => m.type === t).length })).filter((x) => x.value);
  const empRecs = (await loadEmployees(user)).filter((e) => (!q.unidade || e.unitId === q.unidade));
  const hc = headcount(q.familia ? empRecs.filter((e) => emps.some((x) => x.id === e.id)) : empRecs, { from: period.from, to: period.to });
  const promotions = moves.filter((m) => m.type === "PROMOCAO");
  const promotionRate = { value: hc.avg ? promotions.length / hc.avg : null, num: promotions.length, den: hc.avg, rule: "Promoções no período ÷ efetivo médio (ativos no 1º dia + ativos ao fim do último dia) ÷ 2" };

  // Distribuição salarial na faixa (só com permissão de remuneração)
  let distribution: Array<{ positionId: string; title: string; n: number; min: number | null; median: number | null; max: number | null; band: { min: number | null; ref: number; max: number | null } | null; below: number; within: number; above: number; noBand: number; avgCompa: number | null }> | null = null;
  if (showSalary) {
    const groups = new Map<string, typeof active>();
    for (const e of active) groups.set(e.positionId, [...(groups.get(e.positionId) ?? []), e]);
    distribution = [];
    for (const [pid, xs] of groups) {
      const sal = xs.map((e) => ({ e, base: resolveBase(e.baseSalary ? Number(e.baseSalary) : null, e.salaries.map((s) => ({ amount: Number(s.amount), effectiveFrom: dateKey(s.effectiveFrom) })), today) })).filter((x) => x.base !== null) as Array<{ e: (typeof xs)[number]; base: number }>;
      // cada colaborador é comparado à faixa da própria unidade (a da unidade prevalece sobre a geral)
      const units = [...new Set(sal.map((x) => x.e.department.unitId))];
      const bands = new Map(await Promise.all(units.map(async (u) => [u, await bandFor(pid, u)] as const)));
      const pos = sal.map((x) => bandPosition(x.base, bands.get(x.e.department.unitId) ?? null));
      const shown = units.length === 1 ? bands.get(units[0]) ?? null : await bandFor(pid, q.unidade ?? "__geral__");
      const band = shown;
      const noBand = sal.filter((x) => !bands.get(x.e.department.unitId)).length;
      const compas = pos.filter(Boolean).map((p) => p!.compa);
      const values = sal.map((x) => x.base);
      distribution.push({
        positionId: pid, title: xs[0].position.title, n: values.length, min: values.length ? Math.min(...values) : null, median: median(values), max: values.length ? Math.max(...values) : null, band,
        below: pos.filter((p) => p?.where === "ABAIXO").length, within: pos.filter((p) => p?.where === "DENTRO").length, above: pos.filter((p) => p?.where === "ACIMA").length, noBand,
        avgCompa: compas.length ? Math.round((compas.reduce((a, b) => a + b, 0) / compas.length) * 1000) / 1000 : null,
      });
    }
    distribution.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Potenciais sucessores: para cargos de liderança das trilhas, quem ocupa o passo anterior
  const successors = paths.flatMap((p) => p.steps.map((s, i) => ({ p, s, i }))).filter(({ s, i }) => s.position.isLeadership && i > 0).map(({ p, s, i }) => {
    const feeder = p.steps[i - 1];
    const people = elig.filter((x) => x.positionId === feeder.positionId).map((x) => ({ ...x, e: eligibility(x.since, today, s.minMonths, x.score, s.minScore ?? threshold) })).sort((a, b) => RANK[a.e.status] - RANK[b.e.status] || (b.score ?? -1) - (a.score ?? -1));
    return { path: p.name, positionId: s.positionId, title: s.position.title, incumbents: active.filter((e) => e.positionId === s.positionId).length, feeder: feeder.position.title, ready: people.filter((x) => x.e.status === "ELEGIVEL"), developing: people.filter((x) => x.e.status !== "ELEGIVEL") };
  });

  // Vagas preenchidas internamente (movimentação ligada à vaga) × externamente (contratação)
  const jobs = await prisma.jobOpening.findMany({
    where: { ...jobScopeWhere(user), status: "PREENCHIDA", isHistorical: false, ...(q.unidade ? { department: { unitId: q.unidade } } : {}), ...(q.familia ? { position: { careerTrackId: q.familia } } : {}) },
    include: { internalFills: { select: { id: true } }, applications: { where: { status: "CONTRATADO" }, select: { id: true } }, position: { select: { title: true } } },
  });
  const filled = jobs.filter((j) => j.closedAt && inP(dateKey(j.closedAt)));
  const internal = filled.filter((j) => j.internalFills.length > 0);
  return {
    period, threshold, showSalary,
    eligibility: { counts: eligCounts, list: elig.filter((x) => x.best).sort((a, b) => RANK[a.best!.e.status] - RANK[b.best!.e.status] || a.name.localeCompare(b.name)), activeTotal: active.length, pathsCount: paths.length },
    movements: { byType, list: moves.sort((a, b) => +b.effectiveDate - +a.effectiveDate).slice(0, 50) },
    promotions: { count: promotions.length, rate: promotionRate },
    distribution, successors,
    internalFill: { rate: rate(internal.length, filled.length, "Vagas preenchidas por movimentação interna ÷ vagas preenchidas no período"), internal: internal.map((j) => ({ code: j.code, title: j.position.title })), external: filled.length - internal.length },
  };
}
export type CareerIndicators = Awaited<ReturnType<typeof careerIndicators>>;
