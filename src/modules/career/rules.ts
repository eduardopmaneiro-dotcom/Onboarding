/**
 * Regras de carreira (funções puras). Pesos e nota mínima vêm do documento institucional RH-CAR-01.
 * Elegibilidade NÃO é promoção: indica quem atende os critérios objetivos e pode ser levado à avaliação
 * do gestor/comitê, que depende também de vaga e aprovação.
 */
import type { EducationLevel } from "@prisma/client";

/** RH-CAR-01 — pesos da nota de promoção (somam 100). */
export const PROMOTION_WEIGHTS = {
  performance: { label: "Performance", weight: 25 },
  competency: { label: "Competência técnica", weight: 20 },
  behavior: { label: "Comportamento", weight: 15 },
  culturalFit: { label: "Aderência cultural", weight: 10 },
  leadershipPotential: { label: "Potencial de liderança", weight: 10 },
  pdiCompletion: { label: "Conclusão do PDI", weight: 10 },
  conduct: { label: "Conduta", weight: 10 },
} as const;
export type ScoreKey = keyof typeof PROMOTION_WEIGHTS;
/** RH-CAR-01 — nota mínima (0–100) para levar ao comitê. */
export const RH_CAR_01_MIN_SCORE = 70;

export function promotionTotal(s: Record<ScoreKey, number>): number {
  const t = (Object.keys(PROMOTION_WEIGHTS) as ScoreKey[]).reduce((acc, k) => acc + (Math.max(0, Math.min(100, s[k])) * PROMOTION_WEIGHTS[k].weight) / 100, 0);
  return Math.round(t * 10) / 10;
}

/** Meses completos entre duas datas AAAA-MM-DD. */
export function monthsBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  let m = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) m--;
  return Math.max(0, m);
}

export const EDUCATION_ORDER: EducationLevel[] = ["NAO_EXIGIDA", "FUNDAMENTAL_INCOMPLETO", "FUNDAMENTAL", "MEDIO_INCOMPLETO", "MEDIO", "TECNICO", "SUPERIOR_INCOMPLETO", "SUPERIOR", "POS_GRADUACAO"];
/** Atende a escolaridade exigida? null = não dá para saber (escolaridade do candidato não informada). */
export function meetsEducation(has: EducationLevel | null | undefined, required: EducationLevel | null | undefined): boolean | null {
  if (!required || required === "NAO_EXIGIDA") return true;
  if (!has) return null;
  // técnico conta como médio completo
  const rank = (e: EducationLevel) => EDUCATION_ORDER.indexOf(e);
  return rank(has) >= rank(required);
}

export type Eligibility = { status: "ELEGIVEL" | "FALTA_AVALIACAO" | "FALTA_TEMPO" | "NOTA_ABAIXO"; monthsInRole: number; missingMonths: number; score: number | null; minScore: number; minMonths: number };

/** Elegibilidade objetiva para o próximo passo da trilha: tempo mínimo no cargo e nota mínima de promoção. */
export function eligibility(positionSince: string, today: string, minMonths: number | null, latestScore: number | null, minScore: number): Eligibility {
  const monthsInRole = monthsBetween(positionSince, today);
  const mm = minMonths ?? 0;
  const missingMonths = Math.max(0, mm - monthsInRole);
  const base = { monthsInRole, missingMonths, score: latestScore, minScore, minMonths: mm };
  if (missingMonths > 0) return { status: "FALTA_TEMPO", ...base };
  if (latestScore === null) return { status: "FALTA_AVALIACAO", ...base };
  if (latestScore < minScore) return { status: "NOTA_ABAIXO", ...base };
  return { status: "ELEGIVEL", ...base };
}

export const ELIGIBILITY_LABEL: Record<Eligibility["status"], string> = {
  ELEGIVEL: "Atende tempo e nota — pode ser indicado ao comitê",
  FALTA_AVALIACAO: "Atende o tempo — falta avaliação de promoção",
  FALTA_TEMPO: "Ainda não cumpriu o tempo mínimo",
  NOTA_ABAIXO: "Nota abaixo do mínimo — desenvolver pelo PDI",
};

/** Posição do salário na faixa: compa-ratio (salário ÷ referência) e enquadramento. */
export function bandPosition(salary: number | null, band: { min: number | null; ref: number; max: number | null } | null) {
  if (salary === null || !band) return null;
  const compa = Math.round((salary / band.ref) * 1000) / 1000;
  const where = band.min !== null && salary < band.min ? "ABAIXO" : band.max !== null && salary > band.max ? "ACIMA" : "DENTRO";
  const penetration = band.min !== null && band.max !== null && band.max > band.min ? Math.round(((salary - band.min) / (band.max - band.min)) * 1000) / 10 : null;
  return { compa, where: where as "ABAIXO" | "DENTRO" | "ACIMA", penetration };
}

export type FitInput = {
  experiences: Array<{ positionId: string | null; months: number | null }>;
  education: EducationLevel | null;
  competencies: string[];
  rhApprovedFor: string[]; // cargos em que foi aprovado pelo RH em entrevista
};
export type FitTarget = { positionId: string; feederIds: string[]; familyIds: string[]; education: EducationLevel | null; minExperienceMonths: number | null; competencies: string[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Compatibilidade candidato × cargo por evidências (sem nota inventada):
 * experiência no próprio cargo, em cargos que alimentam a trilha ou na mesma família; escolaridade;
 * competências em comum com o descritivo; aprovação anterior do RH para o cargo.
 * FORTE = experiência suficiente (ou aprovado pelo RH para o cargo) e escolaridade atendida.
 */
export function candidateFit(c: FitInput, t: FitTarget) {
  const evidence: string[] = [];
  const sum = (ids: string[]) => c.experiences.filter((e) => e.positionId && ids.includes(e.positionId)).reduce((s, e) => s + (e.months ?? 0), 0);
  const same = sum([t.positionId]);
  const feeder = sum(t.feederIds);
  const family = sum(t.familyIds.filter((id) => id !== t.positionId && !t.feederIds.includes(id)));
  if (same) evidence.push(`${same} mês(es) no próprio cargo`);
  if (feeder) evidence.push(`${feeder} mês(es) em cargo anterior da trilha`);
  if (family) evidence.push(`${family} mês(es) na mesma família`);
  const approved = c.rhApprovedFor.includes(t.positionId);
  if (approved) evidence.push("aprovado pelo RH em entrevista para este cargo");
  const edu = meetsEducation(c.education, t.education);
  if (edu === false) evidence.push("escolaridade abaixo da exigida");
  const comp = t.competencies.filter((x) => c.competencies.some((y) => norm(y) === norm(x)));
  if (comp.length) evidence.push(`competências: ${comp.join(", ")}`);
  const relevant = same + feeder;
  const expOk = t.minExperienceMonths ? relevant >= t.minExperienceMonths : relevant > 0;
  const level = edu !== false && (approved || expOk) ? "FORTE" : relevant || family || comp.length || approved ? "PARCIAL" : null;
  return { level: level as "FORTE" | "PARCIAL" | null, evidence, relevantMonths: relevant, educationOk: edu, competencyMatches: comp };
}
