import { prisma } from "@/lib/prisma";
import { assertCan, type CurrentUser } from "@/lib/session";
import { dateKey, todayKey } from "@/lib/datetime";
import { makePeriod, trailingPeriods, type Granularity } from "@/modules/analytics/periods";
import { employeeScopeWhere } from "@/modules/people/scope";
import { currentRule } from "@/modules/people/rule-settings";
import { headcount, probationTerminations, retention, tenureOfActive, tenureOfLeavers, turnoverBy, type EmpRec } from "@/modules/people/metrics";

export type PermanenceQuery = { gran?: string; ref?: string; unidade?: string; departamento?: string; cargo?: string };

export async function loadEmployees(user: CurrentUser): Promise<EmpRec[]> {
  const rows = await prisma.employee.findMany({
    where: employeeScopeWhere(user),
    select: {
      id: true, fullName: true, admissionDate: true, terminationDate: true, terminationType: true, contractType: true, origin: true, managerId: true, positionId: true, departmentId: true,
      position: { select: { title: true } }, department: { select: { name: true, unit: { select: { id: true, name: true } } } },
    },
  });
  return rows.map((e) => ({
    id: e.id, name: e.fullName, admission: dateKey(e.admissionDate), termination: e.terminationDate ? dateKey(e.terminationDate) : null, terminationType: e.terminationType,
    unitId: e.department.unit.id, unitName: e.department.unit.name, departmentId: e.departmentId, departmentName: e.department.name,
    positionId: e.positionId, positionTitle: e.position.title, managerId: e.managerId, contractType: e.contractType, origin: e.origin,
  }));
}

/** Painel de permanência — mesmo período e filtros do painel de recrutamento. */
export async function buildPermanence(user: CurrentUser, q: PermanenceQuery) {
  assertCan(user, "relatorios.view");
  const gran: Granularity = (["semana", "mes", "trimestre", "ano"] as const).includes(q.gran as Granularity) ? (q.gran as Granularity) : "ano";
  const ref = q.ref && /^\d{4}-\d{2}-\d{2}$/.test(q.ref) ? q.ref : todayKey();
  const period = makePeriod(gran, ref);
  const today = todayKey();
  const [all, rule] = await Promise.all([loadEmployees(user), currentRule()]);
  const options = {
    units: [...new Map(all.map((e) => [e.unitId, { value: e.unitId, label: e.unitName }])).values()].sort((a, b) => a.label.localeCompare(b.label)),
    departments: [...new Set(all.map((e) => e.departmentName))].sort().map((d) => ({ value: d, label: d })),
    positions: [...new Map(all.map((e) => [e.positionId, { value: e.positionId, label: e.positionTitle }])).values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
  const emps = all.filter((e) => (!q.unidade || e.unitId === q.unidade) && (!q.departamento || e.departmentName === q.departamento) && (!q.cargo || e.positionId === q.cargo));
  const p = { from: period.from, to: period.to };
  return {
    period, today, rule, options, filters: q,
    base: { total: emps.length, recrutamento: emps.filter((e) => e.origin === "RECRUTAMENTO").length, direto: emps.filter((e) => e.origin === "CADASTRO_DIRETO").length },
    headcount: headcount(emps, p),
    admissions: emps.filter((e) => e.admission >= p.from && e.admission < p.to).length,
    terminations: emps.filter((e) => e.termination && e.termination >= p.from && e.termination < p.to).length,
    retention: rule.milestones.map((d) => ({ days: d, r: retention(emps, p, d, rule, today) })),
    probation: probationTerminations(emps, p, rule),
    leavers: tenureOfLeavers(emps, p),
    active: tenureOfActive(emps, today),
    byUnit: turnoverBy(emps, p, "unit"),
    byPosition: turnoverBy(emps, p, "position"),
    total: turnoverBy(emps, p, "all")[0] ?? null,
    trend: trailingPeriods(period, gran === "ano" ? 5 : 12).map((tp) => {
      const k = { from: tp.from, to: tp.to };
      return { key: tp.from, label: tp.label, admissions: emps.filter((e) => e.admission >= k.from && e.admission < k.to).length, terminations: emps.filter((e) => e.termination && e.termination >= k.from && e.termination < k.to).length };
    }),
  };
}
export type Permanence = Awaited<ReturnType<typeof buildPermanence>>;
