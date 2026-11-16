import type { CurrentUser } from "@/lib/session";
import { todayKey } from "@/lib/datetime";
import { filterOptions, loadDataset } from "@/modules/analytics/dataset";
import { conversion, filterDataset, hiresByRecruiter, interviewsBy, managerEvaluationTime, reasonsBreakdown, recruitmentCounts, slaSummary, trend, type Filters } from "@/modules/analytics/metrics";
import { GRAN_LABEL, makePeriod, trailingPeriods, type Granularity } from "@/modules/analytics/periods";
import { targetResolver } from "@/modules/analytics/sla";

export type ReportQuery = { gran?: string; ref?: string; unidade?: string; departamento?: string; cargo?: string; recrutadora?: string; gestor?: string };

export function parseQuery(q: ReportQuery) {
  const gran: Granularity = (["semana", "mes", "trimestre", "ano"] as const).includes(q.gran as Granularity) ? (q.gran as Granularity) : "mes";
  const ref = q.ref && /^\d{4}-\d{2}-\d{2}$/.test(q.ref) ? q.ref : todayKey();
  const filters: Filters = { unitId: q.unidade || undefined, departmentName: q.departamento || undefined, positionId: q.cargo || undefined, recruiter: q.recrutadora || undefined, managerId: q.gestor || undefined };
  return { gran, ref, filters };
}

/** Relatório completo (a mesma estrutura alimenta a tela, o Excel e o PDF). */
export async function buildReport(user: CurrentUser, q: ReportQuery) {
  const { gran, ref, filters } = parseQuery(q);
  const period = makePeriod(gran, ref);
  const [full, resolve] = await Promise.all([loadDataset(user), targetResolver()]);
  const options = filterOptions(full);
  const ds = filterDataset(full, filters);
  const labels = {
    unidade: options.units.find((o) => o.value === filters.unitId)?.label,
    departamento: filters.departmentName,
    cargo: options.positions.find((o) => o.value === filters.positionId)?.label,
    recrutadora: filters.recruiter,
    gestor: options.managers.find((o) => o.value === filters.managerId)?.label,
  };
  return {
    generatedAt: new Date(),
    period, granLabel: GRAN_LABEL[gran], filters, filterLabels: labels, options,
    counts: recruitmentCounts(ds, period),
    conversion: conversion(ds, period),
    byRecruiter: interviewsBy(ds, period, "recruiter"),
    byDepartment: interviewsBy(ds, period, "departmentName"),
    byUnit: interviewsBy(ds, period, "unitName"),
    byPosition: interviewsBy(ds, period, "positionTitle"),
    hiresByRecruiter: hiresByRecruiter(ds, period),
    managerTime: managerEvaluationTime(ds, period),
    sla: slaSummary(ds, period, resolve),
    trend: trend(ds, trailingPeriods(period, gran === "ano" ? 5 : 12), gran),
    reasons: reasonsBreakdown(ds, period),
    base: { interviews: ds.interviews.filter((i) => i.scheduledAt >= period.fromDate && i.scheduledAt < period.toDate), historicalInScope: ds.apps.filter((a) => a.historical).length },
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

export function filterSummary(r: Report): string {
  const f = Object.entries(r.filterLabels).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  return `${r.granLabel}: ${r.period.label}${f.length ? ` · ${f.join(" · ")}` : " · todas as unidades"}`;
}
