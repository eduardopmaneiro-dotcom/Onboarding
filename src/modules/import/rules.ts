/**
 * Regras de interpretação da planilha de recrutamento do RH.
 * Derivadas da planilha real (93 linhas, set–nov/2026): a coluna "Aprovado pelo RH?"
 * mistura resultado do RH, avaliação externa (AGINCO / sindicância), decisão do
 * candidato, decisão do gestor e próximos passos. Cada texto vira um "desfecho"
 * explícito, que o RH pode corrigir na tela antes de importar.
 */
import type { ExternalCheckStatus, InterviewResult, ManagerDecision, ApplicationStatus } from "@prisma/client";
import { normalizeText, parseMoney } from "@/lib/text";

export type ImportField =
  | "unidade" | "data" | "hora" | "candidato" | "telefone" | "email" | "vaga" | "departamento"
  | "recrutador" | "resultado" | "motivo" | "observacao" | "origem" | "pretensao" | "ignorar";

export const FIELD_LABEL: Record<ImportField, string> = {
  unidade: "Unidade", data: "Data da entrevista", hora: "Horário", candidato: "Nome do candidato", telefone: "Telefone",
  email: "E-mail", vaga: "Vaga / cargo", departamento: "Departamento / setor", recrutador: "Recrutador / entrevistador",
  resultado: "Resultado", motivo: "Motivo", observacao: "Observação", origem: "Origem do candidato", pretensao: "Pretensão salarial",
  ignorar: "— Não importar esta coluna —",
};

const HEADER_SYNONYMS: Record<Exclude<ImportField, "ignorar">, string[]> = {
  unidade: ["unidade", "hotel", "unid", "filial"],
  data: ["data entrevista", "data da entrevista", "data", "dt entrevista", "dia"],
  hora: ["hora", "horario", "hora entrevista"],
  candidato: ["candidato", "nome", "nome do candidato", "candidata", "nome completo"],
  telefone: ["telefone", "celular", "whatsapp", "contato", "tel", "fone"],
  email: ["email", "e mail"],
  vaga: ["vaga", "cargo", "funcao", "posicao"],
  departamento: ["setor", "departamento", "area"],
  recrutador: ["recrutador", "entrevistador", "responsavel", "recrutadora"],
  resultado: ["aprovado pelo rh?", "aprovado pelo rh", "resultado", "status", "aprovado", "parecer"],
  motivo: ["motivo", "motivo reprovacao", "motivo da reprovacao", "justificativa"],
  observacao: ["observacao", "observacoes", "obs", "comentario", "comentarios"],
  origem: ["origem", "fonte", "canal"],
  pretensao: ["pretensao", "pretensao salarial", "salario pretendido"],
};

export function suggestField(header: string): ImportField {
  const h = normalizeText(header).replace(/\?/g, "");
  if (!h) return "ignorar";
  for (const [field, list] of Object.entries(HEADER_SYNONYMS)) if (list.some((s) => h === normalizeText(s).replace(/\?/g, ""))) return field as ImportField;
  for (const [field, list] of Object.entries(HEADER_SYNONYMS)) if (list.some((s) => s.length > 3 && h.includes(normalizeText(s)))) return field as ImportField;
  return "ignorar";
}

// ─────────── Desfechos ───────────

export type Outcome =
  | "APROVADO" | "APROVADO_AGUARDA_EXTERNA" | "APROVADO_EXTERNA_APROVADA" | "APROVADO_EXTERNA_REPROVADA" | "APROVADO_CANDIDATO_DESISTIU"
  | "APROVADO_AGUARDA_GESTOR" | "APROVADO_GESTOR_REPROVOU" | "REPROVADO" | "REPROVADO_EXTERNA_REPROVADA"
  | "DESISTIU" | "DESISTIU_PROPOSTA" | "NAO_COMPARECEU" | "BANCO_TALENTOS" | "PENDENTE";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  APROVADO: "Aprovado pelo RH (desfecho seguinte não registrado)",
  APROVADO_AGUARDA_EXTERNA: "Aprovado pelo RH · aguardando avaliação externa (AGINCO/sindicância)",
  APROVADO_EXTERNA_APROVADA: "Aprovado pelo RH · aprovado na avaliação externa",
  APROVADO_EXTERNA_REPROVADA: "Aprovado pelo RH · reprovado na avaliação externa",
  APROVADO_CANDIDATO_DESISTIU: "Aprovado pelo RH · candidato desistiu/declinou",
  APROVADO_AGUARDA_GESTOR: "Aprovado pelo RH · aguardando gestor / próxima entrevista",
  APROVADO_GESTOR_REPROVOU: "Aprovado pelo RH · reprovado pelo gestor",
  REPROVADO: "Reprovado pelo RH",
  REPROVADO_EXTERNA_REPROVADA: "Reprovado pelo RH e na avaliação externa",
  DESISTIU: "Candidato desistiu / declinou",
  DESISTIU_PROPOSTA: "Candidato não aceitou a proposta (salário/condições)",
  NAO_COMPARECEU: "Não compareceu",
  BANCO_TALENTOS: "Banco de talentos",
  PENDENTE: "Pendente (sem decisão registrada)",
};

export const OUTCOME_EFFECT: Record<Outcome, { rh: InterviewResult; external: ExternalCheckStatus; manager: ManagerDecision | null; app: ApplicationStatus }> = {
  APROVADO: { rh: "APROVADO", external: "NAO_APLICA", manager: null, app: "APROVADO" },
  APROVADO_AGUARDA_EXTERNA: { rh: "APROVADO", external: "AGUARDANDO", manager: null, app: "AVALIACAO" },
  APROVADO_EXTERNA_APROVADA: { rh: "APROVADO", external: "APROVADO", manager: null, app: "APROVADO" },
  APROVADO_EXTERNA_REPROVADA: { rh: "APROVADO", external: "REPROVADO", manager: null, app: "REPROVADO" },
  APROVADO_CANDIDATO_DESISTIU: { rh: "APROVADO", external: "NAO_APLICA", manager: null, app: "DESISTENTE" },
  APROVADO_AGUARDA_GESTOR: { rh: "APROVADO", external: "NAO_APLICA", manager: "PENDENTE", app: "AGUARDANDO_GESTOR" },
  APROVADO_GESTOR_REPROVOU: { rh: "APROVADO", external: "NAO_APLICA", manager: "REPROVADO", app: "REPROVADO" },
  REPROVADO: { rh: "REPROVADO", external: "NAO_APLICA", manager: null, app: "REPROVADO" },
  REPROVADO_EXTERNA_REPROVADA: { rh: "REPROVADO", external: "REPROVADO", manager: null, app: "REPROVADO" },
  DESISTIU: { rh: "DESISTIU", external: "NAO_APLICA", manager: null, app: "DESISTENTE" },
  DESISTIU_PROPOSTA: { rh: "DESISTIU", external: "NAO_APLICA", manager: null, app: "DESISTENTE" },
  NAO_COMPARECEU: { rh: "NAO_COMPARECEU", external: "NAO_APLICA", manager: null, app: "NAO_COMPARECEU" },
  BANCO_TALENTOS: { rh: "PENDENTE", external: "NAO_APLICA", manager: null, app: "BANCO_TALENTOS" },
  PENDENTE: { rh: "PENDENTE", external: "NAO_APLICA", manager: null, app: "ENTREVISTA" },
};

const EXT = /agin[cg]o|sindicanc/;

/** Interpreta o texto de resultado (e ajusta pelo motivo quando ele traz o desfecho). */
export function interpretOutcome(resultText: unknown, motivoText?: unknown): { outcome: Outcome; recognized: boolean } {
  const t = normalizeText(resultText);
  const m = normalizeText(motivoText);
  let o: Outcome | null = null;
  if (!t) o = null;
  else if (/banco de talento/.test(t)) o = "BANCO_TALENTOS";
  else if (/nao compareceu|faltou|nao veio/.test(t)) o = "NAO_COMPARECEU";
  else if (/nao aceitou|recusou/.test(t)) o = "DESISTIU_PROPOSTA";
  else if (/^(sim|aprovad)/.test(t)) {
    if (/nao gestor|reprovado gestor|gestor nao/.test(t)) o = "APROVADO_GESTOR_REPROVOU";
    else if (/reprovad\w* agin[cg]o/.test(t)) o = "APROVADO_EXTERNA_REPROVADA";
    else if (EXT.test(t) && /aguard/.test(t)) o = "APROVADO_AGUARDA_EXTERNA";
    else if (/sindicanc/.test(t)) o = "APROVADO_AGUARDA_EXTERNA";
    else if (/declin|desist/.test(t)) o = "APROVADO_CANDIDATO_DESISTIU";
    else if (/aguard|duvida|entrevista com|chefe/.test(t)) o = "APROVADO_AGUARDA_GESTOR";
    else o = "APROVADO";
  } else if (/^reprovad\w* agin[cg]o/.test(t)) o = "APROVADO_EXTERNA_REPROVADA";
  else if (/^(nao|reprovad)/.test(t)) o = EXT.test(t) ? "REPROVADO_EXTERNA_REPROVADA" : "REPROVADO";
  else if (/declin|desist/.test(t)) o = "DESISTIU";
  else if (/aguard|buscar referencia|analisar|verificar|agendar/.test(t)) o = "PENDENTE";

  const recognized = o !== null || !t;
  let outcome: Outcome = o ?? "PENDENTE";
  // O motivo às vezes registra o desfecho seguinte ("Aprovado - AGINCO", "REPROVADO AGINGO", "declinou")
  if (outcome === "APROVADO" || outcome === "APROVADO_AGUARDA_GESTOR") {
    if (/reprovad\w* agin[cg]o/.test(m)) outcome = "APROVADO_EXTERNA_REPROVADA";
    else if (/declin/.test(m)) outcome = "APROVADO_CANDIDATO_DESISTIU";
    else if (/aprovad\w*.*agin[cg]o|^agin[cg]o$/.test(m)) outcome = "APROVADO_EXTERNA_APROVADA";
  }
  if (outcome === "DESISTIU" && /salari|proposta/.test(m)) outcome = "DESISTIU_PROPOSTA";
  return { outcome, recognized };
}

// ─────────── Motivos ───────────

/** Sugere o motivo padronizado a partir do texto livre. null = texto não é um motivo (só observação). */
export function suggestReason(motivoText: unknown, outcome: Outcome): string | null {
  const m = normalizeText(motivoText);
  const negative = OUTCOME_EFFECT[outcome].rh === "REPROVADO" || OUTCOME_EFFECT[outcome].rh === "DESISTIU" || outcome === "APROVADO_GESTOR_REPROVOU";
  if (!negative) return null;
  if (/cultura|aderente|comportament|postura|atitude/.test(m)) return "COMPORTAMENTAL";
  if (/salari|proposta|faixa|r\$|remunera/.test(m)) return "PRETENSAO_SALARIAL";
  if (/escala|12x36|6x1|fim de semana/.test(m)) return "ESCALA";
  if (/horario|dupla jornada|manha|noite|turno|disponibilidade/.test(m)) return "DISPONIBILIDADE_HORARIO";
  if (/escolaridade|ensino|formacao/.test(m)) return "ESCOLARIDADE";
  if (/experiencia/.test(m)) return "EXPERIENCIA";
  if (/conhecimento|competencia|tecnic|perfil de|nao possui perfil/.test(m)) return "TECNICA";
  if (/longe|passagem|distancia|deslocamento|pj|modalidade|contratacao/.test(m)) return "OUTRO";
  if (outcome === "DESISTIU_PROPOSTA") return "PRETENSAO_SALARIAL";
  if (OUTCOME_EFFECT[outcome].rh === "REPROVADO") return m ? "OUTRO" : "NAO_INFORMADO";
  return null;
}

/** Extrai valores em R$ do texto livre (marcados para revisão). */
export function extractSalaries(text: unknown): { lastSalary?: number; expectedSalary?: number } {
  const t = String(text ?? "");
  const values = [...t.matchAll(/R\$\s*([\d.,]+)/gi)].map((x) => parseMoney(x[1])).filter((n): n is number => n !== null && n >= 500);
  if (!values.length) return {};
  const n = normalizeText(t);
  const afterEq = t.includes("=") ? parseMoney(t.split("=").pop()) : null;
  const value = afterEq && afterEq >= 500 ? afterEq : values[values.length - 1];
  if (/ganhando|recebe|atualmente|salario atual|ultimo salario/.test(n)) return { lastSalary: value };
  if (/acima|pretens|pede|quer/.test(n)) return { expectedSalary: value };
  return {};
}

// ─────────── Nomes e etapas ───────────

/** "Fulano de Tal 2º etapa " → { name: "Fulano de Tal", stage: 2 } */
export function cleanCandidateName(raw: unknown): { name: string; stage: number | null } {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  let stage: number | null = null;
  const m = s.match(/\(?\s*(\d)\s*(?:º|ª|o|a)?\s*etapa\s*\)?/i) || s.match(/\(?\s*(segunda|terceira)\s+etapa\s*\)?/i);
  if (m) {
    stage = /segunda/i.test(m[1]) ? 2 : /terceira/i.test(m[1]) ? 3 : Number(m[1]);
    s = s.replace(m[0], " ").replace(/\s+/g, " ").trim();
  }
  s = s.replace(/[-–]\s*$/, "").trim();
  return { name: s, stage };
}

/** Recrutador: "Sara/ Aline" → "Sara / Aline"; primeiro nome é o principal. */
export function tidyInterviewer(raw: unknown): { display: string; primary: string } {
  const parts = String(raw ?? "").split("/").map((p) => p.trim()).filter(Boolean);
  return { display: parts.join(" / "), primary: parts[0] ?? "" };
}

/** Abreviações comuns nas grafias de cargo da planilha. */
const ABBREV: Array<[RegExp, string]> = [
  [/^ass\.?\s/i, "assistente "],
  [/^aux\.?\s/i, "auxiliar "],
  [/^asg$/i, "auxiliar de servicos gerais"],
  [/^rm$/i, "revenue manager"],
  [/^ti$/i, "analista de ti"],
  [/governaca/i, "governanca"],
  [/^chef de fila$/i, "chefe de fila"],
  [/^gerente a&b$/i, "gerente de a&b"],
];

export function expandPositionText(raw: unknown): string {
  let s = normalizeText(raw);
  for (const [re, rep] of ABBREV) s = s.replace(re, rep);
  return normalizeText(s);
}
