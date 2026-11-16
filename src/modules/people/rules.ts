/**
 * Regras de datas do ciclo inicial (funções puras, testadas com datas conhecidas).
 * Datas são chaves "AAAA-MM-DD" no fuso de Brasília.
 */
import { addDays } from "@/lib/datetime";

export type ProbationRule = { milestones: number[]; countAdmissionDay: boolean };

export function parseMilestones(v: string): number[] {
  return v.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
}

/**
 * Data do marco de N dias. Com "o dia da admissão conta como 1º dia" (regra da CLT para o
 * contrato de experiência), o 45º dia de quem entrou em 01/03 é 14/04 (admissão + 44).
 * Sem essa regra, o marco é admissão + N.
 */
export function milestoneDate(admission: string, days: number, countAdmissionDay: boolean): string {
  return addDays(admission, countAdmissionDay ? days - 1 : days);
}

export function probationEnd(admission: string, rule: ProbationRule): string {
  return milestoneDate(admission, Math.max(...rule.milestones), rule.countAdmissionDay);
}

/** Diferença em dias corridos entre duas chaves (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Tempo de casa em dias, contando o dia da admissão (admitido hoje = 1 dia). */
export function tenureDays(admission: string, end: string): number {
  return Math.max(0, daysBetween(admission, end) + 1);
}

/** Tempo de casa por extenso: "1 ano, 2 meses e 3 dias" (calendário, não média de 30 dias). */
export function tenureLabel(admission: string, end: string): string {
  if (end < admission) return "—";
  const [y1, m1, d1] = admission.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  let years = y2 - y1, months = m2 - m1, days = d2 - d1;
  if (days < 0) { months--; days += new Date(Date.UTC(y2, m2 - 1, 0)).getUTCDate(); }
  if (months < 0) { years--; months += 12; }
  const parts = [years && `${years} ano${years > 1 ? "s" : ""}`, months && `${months} ${months > 1 ? "meses" : "mês"}`, days && `${days} dia${days > 1 ? "s" : ""}`].filter(Boolean) as string[];
  if (!parts.length) return "0 dia";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

/** Desligamento dentro do período de experiência (até o último marco, inclusive). */
export function terminatedDuringProbation(admission: string, termination: string, rule: ProbationRule): boolean {
  return termination <= probationEnd(admission, rule);
}

/** Retido no marco N: não foi desligado até o dia do marco (desligado no próprio dia não conta como retido). */
export function retainedAt(admission: string, termination: string | null, days: number, rule: ProbationRule): boolean {
  return termination === null || termination > milestoneDate(admission, days, rule.countAdmissionDay);
}
