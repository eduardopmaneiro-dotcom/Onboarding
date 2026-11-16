/**
 * Indicadores de permanência (funções puras sobre a base de colaboradores).
 * Tudo é calculado a partir das datas de admissão e desligamento — nada é digitado.
 */
import type { TerminationType } from "@prisma/client";
import { addDays } from "@/lib/datetime";
import { mean, median, rate, type Rate } from "@/modules/analytics/metrics";
import { milestoneDate, probationEnd, retainedAt, tenureDays, type ProbationRule } from "@/modules/people/rules";
import { TERMINATION_INITIATIVE } from "@/modules/admission/constants";

export type EmpRec = {
  id: string; name: string; admission: string; termination: string | null; terminationType: TerminationType | null;
  unitId: string; unitName: string; departmentId: string; departmentName: string; positionId: string; positionTitle: string;
  managerId: string | null; contractType: string; origin: string;
};
export type KeyPeriod = { from: string; to: string }; // `to` exclusivo

const inP = (k: string | null, p: KeyPeriod) => !!k && k >= p.from && k < p.to;
const lastDay = (p: KeyPeriod) => addDays(p.to, -1);

/** Retenção no marco de N dias: admitidos no período que já completaram N dias e não foram desligados até o marco. */
export function retention(emps: EmpRec[], p: KeyPeriod, days: number, rule: ProbationRule, today: string): Rate {
  const cohort = emps.filter((e) => inP(e.admission, p));
  let num = 0, den = 0, immature = 0;
  for (const e of cohort) {
    const due = milestoneDate(e.admission, days, rule.countAdmissionDay);
    const leftBefore = e.termination !== null && e.termination <= due;
    if (due > today && !leftBefore) { immature++; continue; } // ainda não chegou ao marco (e segue ativo)
    den++;
    if (retainedAt(e.admission, e.termination, days, rule)) num++;
  }
  return rate(num, den, `Admitidos no período que já completaram ${days} dias e seguiam ativos no ${days}º dia ÷ admitidos no período que já completaram ${days} dias (ou saíram antes)`, { [`ainda não completaram ${days} dias`]: immature });
}

/** Desligamentos durante a experiência ÷ desligamentos do período. */
export function probationTerminations(emps: EmpRec[], p: KeyPeriod, rule: ProbationRule) {
  const out = emps.filter((e) => inP(e.termination, p));
  const during = out.filter((e) => e.contractType === "CLT" && e.termination! <= probationEnd(e.admission, rule));
  const byInitiative: Record<string, number> = {};
  for (const e of during) { const k = TERMINATION_INITIATIVE[e.terminationType ?? "OUTRO"]; byInitiative[k] = (byInitiative[k] ?? 0) + 1; }
  return {
    count: during.length,
    share: rate(during.length, out.length, "Desligamentos até o último dia da experiência ÷ todos os desligamentos do período"),
    ofAdmissions: rate(during.filter((e) => inP(e.admission, p)).length, emps.filter((e) => inP(e.admission, p) && e.contractType === "CLT").length, "Admitidos (CLT) no período desligados ainda na experiência ÷ admitidos (CLT) no período"),
    byInitiative,
    list: during,
  };
}

/** Tempo médio de permanência de quem saiu no período (dias, contando o dia da admissão). */
export function tenureOfLeavers(emps: EmpRec[], p: KeyPeriod) {
  const xs = emps.filter((e) => inP(e.termination, p)).map((e) => tenureDays(e.admission, e.termination!));
  return { n: xs.length, mean: mean(xs), median: median(xs) };
}

/** Tempo de casa de quem está ativo hoje. */
export function tenureOfActive(emps: EmpRec[], today: string) {
  const xs = emps.filter((e) => e.admission <= today && (e.termination === null || e.termination >= today)).map((e) => tenureDays(e.admission, today));
  return { n: xs.length, mean: mean(xs), median: median(xs) };
}

/** Efetivo: no início do período (ativos no primeiro dia) e no fim (ativos ao fim do último dia). */
export function headcount(emps: EmpRec[], p: KeyPeriod) {
  const start = emps.filter((e) => e.admission <= p.from && (e.termination === null || e.termination >= p.from)).length;
  const end = emps.filter((e) => e.admission <= lastDay(p) && (e.termination === null || e.termination > lastDay(p))).length;
  return { start, end, avg: (start + end) / 2 };
}

export type TurnoverRow = { key: string; label: string; start: number; end: number; avg: number; admissions: number; terminations: number; voluntary: number; turnover: number | null; rotatividade: number | null };

/** Turnover por grupo: desligamentos ÷ efetivo médio; rotatividade = ((admissões + desligamentos) ÷ 2) ÷ efetivo médio. */
export function turnoverBy(emps: EmpRec[], p: KeyPeriod, dim: "unit" | "position" | "department" | "all"): TurnoverRow[] {
  const key = (e: EmpRec) => (dim === "unit" ? [e.unitId, e.unitName] : dim === "position" ? [e.positionId, e.positionTitle] : dim === "department" ? [`${e.unitId}:${e.departmentName}`, `${e.departmentName} — ${e.unitName}`] : ["all", "Total"]);
  const groups = new Map<string, { label: string; xs: EmpRec[] }>();
  for (const e of emps) { const [k, l] = key(e); const g = groups.get(k) ?? { label: l, xs: [] }; g.xs.push(e); groups.set(k, g); }
  return [...groups.entries()].map(([k, g]) => {
    const h = headcount(g.xs, p);
    const admissions = g.xs.filter((e) => inP(e.admission, p)).length;
    const outs = g.xs.filter((e) => inP(e.termination, p));
    return {
      key: k, label: g.label, ...h, admissions, terminations: outs.length,
      voluntary: outs.filter((e) => TERMINATION_INITIATIVE[e.terminationType ?? "OUTRO"] === "Colaborador").length,
      turnover: h.avg ? outs.length / h.avg : null,
      rotatividade: h.avg ? (admissions + outs.length) / 2 / h.avg : null,
    };
  }).filter((r) => r.start || r.end || r.admissions || r.terminations).sort((a, b) => b.terminations - a.terminations || a.label.localeCompare(b.label));
}
