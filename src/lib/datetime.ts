/**
 * Datas no fuso de São Paulo. O Brasil não tem horário de verão desde 2019,
 * então o deslocamento é fixo (-03:00). Banco grava em UTC.
 */
export const TZ = "America/Sao_Paulo";
const OFFSET = "-03:00";

/** "2026-11-16" + "14:30" → Date (UTC) */
export function localToDate(date: string, time = "00:00"): Date {
  return new Date(`${date}T${time.length === 5 ? time : "00:00"}:00${OFFSET}`);
}

/** Date → "2026-11-16" no fuso de SP */
export function dateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function timeKey(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = localToDate(key, "12:00");
  d.setUTCDate(d.getUTCDate() + n);
  return dateKey(d);
}

/** Segunda-feira da semana de `key` */
export function startOfWeek(key: string): string {
  const d = localToDate(key, "12:00");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return addDays(key, -dow);
}

export function startOfMonth(key: string): string {
  return key.slice(0, 8) + "01";
}

export function fmtDate(d: Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }): string {
  return d ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...opts }).format(d) : "—";
}

export function fmtDateTime(d: Date | null | undefined, hasTime = true): string {
  if (!d) return "—";
  return hasTime ? `${fmtDate(d)} ${timeKey(d)}` : fmtDate(d);
}

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
