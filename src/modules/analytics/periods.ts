import { addDays, dateKey, localToDate, MONTHS, startOfMonth, startOfWeek, todayKey } from "@/lib/datetime";

export type Granularity = "semana" | "mes" | "trimestre" | "ano";
export const GRAN_LABEL: Record<Granularity, string> = { semana: "Semana", mes: "Mês", trimestre: "Trimestre", ano: "Ano" };

export type Period = { gran: Granularity; from: string; to: string; label: string; fromDate: Date; toDate: Date };

/** Início do período (AAAA-MM-DD) que contém `key`. */
export function periodStart(gran: Granularity, key: string): string {
  if (gran === "semana") return startOfWeek(key);
  if (gran === "mes") return startOfMonth(key);
  if (gran === "trimestre") {
    const m = Number(key.slice(5, 7));
    return `${key.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  }
  return `${key.slice(0, 4)}-01-01`;
}

/** Próximo início de período (exclusivo). */
export function periodEnd(gran: Granularity, start: string): string {
  if (gran === "semana") return addDays(start, 7);
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  const step = gran === "mes" ? 1 : gran === "trimestre" ? 3 : 12;
  const nm = m - 1 + step;
  return `${y + Math.floor(nm / 12)}-${String((nm % 12) + 1).padStart(2, "0")}-01`;
}

export function periodLabel(gran: Granularity, start: string): string {
  const y = start.slice(0, 4);
  const m = Number(start.slice(5, 7));
  if (gran === "semana") {
    const end = addDays(start, 6);
    return `${start.slice(8, 10)}/${start.slice(5, 7)} a ${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`;
  }
  if (gran === "mes") return `${MONTHS[m - 1]} de ${y}`;
  if (gran === "trimestre") return `${Math.floor((m - 1) / 3) + 1}º trimestre de ${y}`;
  return y;
}

export function makePeriod(gran: Granularity, ref = todayKey()): Period {
  const from = periodStart(gran, ref);
  const to = periodEnd(gran, from);
  return { gran, from, to, label: periodLabel(gran, from), fromDate: localToDate(from), toDate: localToDate(to) };
}

export function shiftPeriod(p: Period, n: number): Period {
  let s = p.from;
  if (n > 0) for (let i = 0; i < n; i++) s = periodEnd(p.gran, s);
  else for (let i = 0; i < -n; i++) s = periodStart(p.gran, addDays(s, -1));
  return makePeriod(p.gran, s);
}

/** Os `count` períodos que terminam no período `p` (para gráficos de tendência). */
export function trailingPeriods(p: Period, count = 12): Period[] {
  const out: Period[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(shiftPeriod(p, -i));
  return out;
}

export function inPeriod(d: Date | null | undefined, p: { fromDate: Date; toDate: Date }): boolean {
  return !!d && d >= p.fromDate && d < p.toDate;
}

export function bucketOf(d: Date, gran: Granularity): string {
  return periodStart(gran, dateKey(d));
}
