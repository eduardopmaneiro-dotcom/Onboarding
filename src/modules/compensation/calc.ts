/**
 * Cálculos de remuneração (funções puras). Valores ausentes ficam ausentes: nada é estimado
 * sem parâmetro da empresa. Cada resultado traz a lista do que faltou ("parcial").
 */
import { addDays } from "@/lib/datetime";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Competência "AAAA-MM" → intervalo de chaves [from, to) e último dia. */
export function competenceRange(c: string) {
  const [y, m] = c.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to, last: addDays(to, -1) };
}
export function isCompetence(c: unknown): c is string {
  return typeof c === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
}
export function shiftCompetence(c: string, n: number): string {
  const [y, m] = c.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Salário-base vigente numa data: último registro do histórico até a data; sem histórico, o de admissão. */
export function resolveBase(admissionSalary: number | null, history: Array<{ amount: number; effectiveFrom: string }>, at: string): number | null {
  const valid = history.filter((h) => h.effectiveFrom <= at).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return valid[0]?.amount ?? admissionSalary;
}

/** Tabela do cargo vigente: a da unidade tem precedência sobre a geral. */
export function resolvePositionSalary(rows: Array<{ unitId: string | null; baseSalary: number; effectiveFrom: string; minSalary?: number | null; maxSalary?: number | null }>, unitId: string, at: string) {
  const pick = (xs: typeof rows) => xs.filter((r) => r.effectiveFrom <= at).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  const unit = pick(rows.filter((r) => r.unitId === unitId));
  const row = unit ?? pick(rows.filter((r) => r.unitId === null));
  if (!row) return null;
  return { value: row.baseSalary, scope: unit ? ("unidade" as const) : ("geral" as const), min: row.minSalary ?? null, max: row.maxSalary ?? null };
}

export type BenefitDef = { name: string; costType: "MENSAL" | "POR_DIA" | "SEM_CUSTO"; companyCost: number | null; dependentCost: number | null; discountType: "NENHUM" | "FIXO" | "PERCENTUAL_SALARIO"; discountValue: number | null };
export type Enrollment = { companyCost: number | null; daysPerMonth: number | null; dependents: number };

/**
 * Custo do benefício no mês: bruto (empresa paga ao fornecedor), desconto do colaborador e líquido.
 * Prioridade do valor: individual da adesão › valor da unidade › valor do benefício.
 * Desconto percentual (ex.: VT até 6% do salário-base) nunca passa do custo bruto.
 */
export function benefitCost(b: BenefitDef, e: Enrollment, unitCost: number | null, baseSalary: number | null): { gross: number | null; discount: number | null; net: number | null; missing: string | null } {
  if (b.costType === "SEM_CUSTO") return { gross: 0, discount: 0, net: 0, missing: null };
  const unitValue = e.companyCost ?? unitCost ?? b.companyCost;
  if (unitValue === null) return { gross: null, discount: null, net: null, missing: `${b.name}: valor não cadastrado` };
  let gross: number;
  if (b.costType === "POR_DIA") {
    if (!e.daysPerMonth) return { gross: null, discount: null, net: null, missing: `${b.name}: dias por mês não informados na adesão` };
    gross = unitValue * e.daysPerMonth;
  } else gross = unitValue;
  if (e.dependents > 0) {
    if (b.dependentCost === null) return { gross: null, discount: null, net: null, missing: `${b.name}: valor por dependente não cadastrado` };
    gross += b.dependentCost * e.dependents;
  }
  let discount = 0;
  if (b.discountType === "FIXO") {
    if (b.discountValue === null) return { gross: r2(gross), discount: null, net: null, missing: `${b.name}: valor do desconto não cadastrado` };
    discount = Math.min(b.discountValue, gross);
  } else if (b.discountType === "PERCENTUAL_SALARIO") {
    if (b.discountValue === null || baseSalary === null) return { gross: r2(gross), discount: null, net: null, missing: `${b.name}: desconto depende do ${b.discountValue === null ? "percentual" : "salário-base"}` };
    discount = Math.min((baseSalary * b.discountValue) / 100, gross);
  }
  return { gross: r2(gross), discount: r2(discount), net: r2(gross - discount), missing: null };
}

export type ElogioRuleDef = { amountPerElogio: number; maxPerMonth: number | null; maxAmountPerMonth: number | null; sources: string[] };

/** Elogio Premiado da competência pelas regras vigentes. Sem regra: não calculado (null). */
export function elogioPremium(rule: ElogioRuleDef | null, approved: Array<{ source: string }>) {
  if (!rule) return null;
  const eligible = approved.filter((e) => !rule.sources.length || rule.sources.includes(e.source)).length;
  const counted = rule.maxPerMonth ? Math.min(eligible, rule.maxPerMonth) : eligible;
  let value = counted * rule.amountPerElogio;
  if (rule.maxAmountPerMonth !== null) value = Math.min(value, rule.maxAmountPerMonth);
  return { eligible, counted, value: r2(value) };
}

/** Encargos: soma das alíquotas cadastradas × base que sofre incidência. Sem alíquota cadastrada: null. */
export function charges(rates: Array<{ label: string; ratePct: number | null }>, base: number) {
  const set = rates.filter((r) => r.ratePct !== null);
  const missing = rates.filter((r) => r.ratePct === null).map((r) => r.label);
  if (!set.length) return { total: null, items: [], missing };
  const items = set.map((r) => ({ label: r.label, ratePct: r.ratePct as number, value: r2((base * (r.ratePct as number)) / 100) }));
  return { total: r2(items.reduce((s, i) => s + i.value, 0)), items, missing };
}

// ───────── PPR ─────────

/** Atingimento ponderado das metas (cada meta limitada ao teto). Null enquanto alguma meta não foi apurada. */
export function pprFactor(goals: Array<{ weightPct: number; achievementPct: number | null }>, capPct: number, minFactorPct: number) {
  const weightSum = goals.reduce((s, g) => s + g.weightPct, 0);
  if (!goals.length || goals.some((g) => g.achievementPct === null)) return { factor: null, weightSum, triggered: null };
  const pct = goals.reduce((s, g) => s + (g.weightPct / 100) * Math.min(g.achievementPct as number, capPct), 0);
  const triggered = pct >= minFactorPct;
  return { factor: triggered ? pct / 100 : 0, weightSum, triggered, pct };
}

/** Meses trabalhados no período: meses com 15 dias ou mais de vínculo (critério usual de proporcionalidade). */
export function monthsWorked(admission: string, termination: string | null, start: string, end: string): number {
  let n = 0;
  let cur = start.slice(0, 7);
  const last = end.slice(0, 7);
  while (cur <= last) {
    const { from, last: lastDay } = competenceRange(cur);
    const a = [from, start, admission].sort().at(-1)!;
    const b = [lastDay, end, termination ?? "9999-12-31"].sort()[0];
    const days = a <= b ? Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1 : 0;
    if (days >= 15) n++;
    cur = shiftCompetence(cur, 1);
  }
  return n;
}

export type PprEmp = { id: string; admission: string; termination: string | null; base: number | null; unitId: string; contractType: string };
export type PprParams = { periodStart: string; periodEnd: string; poolAmount: number | null; distribution: "IGUAL" | "PROPORCIONAL_SALARIO"; minMonths: number; prorate: boolean; unitId: string | null };

/** Distribuição do montante (pool × atingimento) entre os elegíveis (CLT, unidade, meses mínimos). */
export function pprDistribute(p: PprParams, emps: PprEmp[], factor: number) {
  const totalMonths = monthsWorked(p.periodStart, null, p.periodStart, p.periodEnd);
  const pool = p.poolAmount === null ? null : p.poolAmount * factor;
  const rows = emps
    .filter((e) => e.contractType === "CLT" && (!p.unitId || e.unitId === p.unitId))
    .map((e) => ({ ...e, months: monthsWorked(e.admission, e.termination, p.periodStart, p.periodEnd) }))
    .filter((e) => e.months > 0 && e.months >= p.minMonths);
  const missingSalary = p.distribution === "PROPORCIONAL_SALARIO" ? rows.filter((e) => e.base === null).map((e) => e.id) : [];
  const weight = (e: (typeof rows)[number]) => (p.prorate ? e.months / totalMonths : 1) * (p.distribution === "PROPORCIONAL_SALARIO" ? (e.base ?? 0) : 1);
  const sum = rows.reduce((s, e) => s + weight(e), 0);
  const shares = rows.map((e) => ({ id: e.id, months: e.months, share: pool === null || !sum ? null : r2((pool * weight(e)) / sum) }));
  return { pool: pool === null ? null : r2(pool), totalMonths, eligible: rows.length, shares, missingSalary };
}

// ───────── Remuneração total ─────────

export type CompInput = {
  contractType: string;
  base: number | null; // contratual vigente
  items: Array<{ category: "BASE_PAGO" | "ADICIONAL" | "VARIAVEL" | "PREMIACAO"; amount: number; chargeable: boolean }>;
  elogio: { value: number; counted: number } | null;
  elogioRuleMissing: boolean;
  ppr: { monthly: number; projected: boolean } | null;
  benefits: Array<{ net: number | null; gross: number | null; discount: number | null; missing: string | null }>;
  rates: Array<{ label: string; ratePct: number | null }>;
};

/**
 * Remuneração em dinheiro, remuneração total (+ benefícios) e custo total para a empresa (+ encargos),
 * sempre com as parcelas separadas. Salário-base nunca é apresentado como remuneração total.
 */
export function totalCompensation(i: CompInput) {
  const sum = (c: string) => r2(i.items.filter((x) => x.category === c).reduce((s, x) => s + x.amount, 0));
  const paidItems = i.items.filter((x) => x.category === "BASE_PAGO");
  const basePaid = paidItems.length ? sum("BASE_PAGO") : null;
  const adicionais = sum("ADICIONAL"), variaveis = sum("VARIAVEL"), premiacoes = sum("PREMIACAO");
  const elogio = i.elogio?.value ?? 0;
  const ppr = i.ppr?.monthly ?? 0;
  const partial: string[] = [];
  if (i.base === null) partial.push("Salário-base não cadastrado");
  if (i.elogioRuleMissing) partial.push("Elogio Premiado: há elogios aprovados, mas não há regra cadastrada");
  const salary = basePaid ?? i.base ?? 0;
  const cash = r2(salary + adicionais + variaveis + premiacoes + elogio + ppr);
  const benGross = r2(i.benefits.reduce((s, b) => s + (b.gross ?? 0), 0));
  const benDiscount = r2(i.benefits.reduce((s, b) => s + (b.discount ?? 0), 0));
  const benNet = r2(i.benefits.reduce((s, b) => s + (b.net ?? 0), 0));
  for (const b of i.benefits) if (b.missing) partial.push(b.missing);
  // encargos: CLT; base = salário (pago ou contratual) + rubricas com incidência (prêmios e PPR não incidem)
  const chargeBase = r2(salary + i.items.filter((x) => x.category !== "BASE_PAGO" && x.chargeable).reduce((s, x) => s + x.amount, 0));
  const ch = i.contractType === "CLT" ? charges(i.rates, chargeBase) : { total: 0, items: [], missing: [] as string[] };
  if (i.contractType === "CLT" && ch.total === null) partial.push("Encargos: nenhuma alíquota cadastrada");
  else if (ch.missing.length) partial.push(`Encargos sem alíquota: ${ch.missing.join(", ")}`);
  const total = r2(cash + benNet);
  return {
    base: i.base, basePaid, adicionais, variaveis, premiacoes, elogio: i.elogio, ppr: i.ppr,
    beneficios: { gross: benGross, discount: benDiscount, net: benNet },
    encargos: { base: chargeBase, total: ch.total, items: ch.items },
    remuneracaoDinheiro: cash,
    remuneracaoTotal: total,
    custoTotal: r2(total + (ch.total ?? 0)),
    partial,
  };
}
export type CompResult = ReturnType<typeof totalCompensation>;
