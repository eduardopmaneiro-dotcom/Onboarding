/**
 * Regras da carga de dados da empresa (funções puras, testadas).
 * Mapeamentos derivados dos documentos reais: Relatório de Cargos (Sólides) e Folha de Pagamento (GRCA).
 */

/** Minúsculas, sem acentos, sem pontuação ("3º Cozinheiro(a)" → "3 cozinheiro"). */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\((a|o|as|os)\)/g, "").replace(/[º°ª]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const UNIT_WORDS: Record<string, string> = { brisa: "BRISA", imperial: "IMPERIAL", vilamar: "VILAMAR" };

/**
 * Título do relatório de cargos → cargo do catálogo + variação por unidade/contrato.
 * "Garçom Brisa" → { base: "garcom", unit: "BRISA" }; "Gerente Geral Brisa PJ" → { base: "gerente geral", unit: "BRISA", pj: true }.
 */
export function splitTitle(title: string) {
  const words = norm(title).split(" ");
  let unit: string | null = null, pj = false;
  const kept = words.filter((w) => {
    if (UNIT_WORDS[w]) { unit = UNIT_WORDS[w]; return false; }
    if (w === "pj") { pj = true; return false; }
    return true;
  });
  const base = kept.join(" ").trim();
  // título de exibição: o original sem a unidade/PJ, com espaços normalizados
  const display = title.replace(/\b(Brisa|Imperial|Vilamar|BRISA|IMPERIAL|VILAMAR)\b/g, "").replace(/\bPJ\b/g, "").replace(/\s+/g, " ").trim();
  return { base, unit, pj, display };
}

export function titleCase(s: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
  return s.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/** Atividades do relatório (bullets "·", "•", quebras de linha) → lista de responsabilidades. */
export function splitActivities(text: string): string[] {
  return text.split(/\r?\n|[·•]\s*|;\s*(?=[A-ZÀ-Ú])/).map((x) => x.replace(/^[-–\t\s]+/, "").replace(/\s+/g, " ").trim().replace(/[;.]$/, "")).filter((x) => x.length > 2);
}

/** Centro de custo da folha → departamento da estrutura (nome). Desconhecido: cria departamento com o nome do centro. */
export const COST_CENTER_TO_DEPARTMENT: Record<string, string> = {
  "recepcao": "Recepção", "portaria": "Recepção", "governanca": "Governança", "cozinha": "A&B — Cozinha",
  "restaurante": "A&B — Salão", "banquetes": "A&B — Salão", "bar da piscina": "A&B — Salão", "bar do lobby": "A&B — Salão",
  "manutencao": "Manutenção", "reservas": "Reservas e Comercial", "controladoria": "Controladoria", "rh dp": "Recursos Humanos",
  "almoxarifado": "Compras e Almoxarifado", "gerencia geral": "Diretoria",
};
export function departmentFor(costCenter: string): string {
  return COST_CENTER_TO_DEPARTMENT[norm(costCenter)] ?? titleCase(costCenter);
}

/**
 * Rubricas da folha → rubricas da plataforma. "IGNORAR" = não compõe a remuneração mensal recorrente
 * (férias, 13º, rescisão, estouros, devoluções) — fica registrado no resumo da carga.
 */
export const RUBRIC_TO_TYPE: Record<string, string> = {
  "dias normais": "SALARIO_PAGO", "saldo de salario dias": "SALARIO_PAGO", "dias ferias": "SALARIO_PAGO",
  "dias afast inss p doenca": "SALARIO_PAGO", "dias afast p acid trabalho c dir integ": "SALARIO_PAGO",
  "adicional noturno infor": "ADIC_NOTURNO", "reflexo horas adic noturno dsr": "DSR", "descanso semanal remunerado": "DSR",
  "horas extras": "HORA_EXTRA", "insalubridade": "INSALUBRIDADE", "periculosidade": "PERICULOSIDADE",
  "cargo de confianca": "GRATIFICACAO", "feriado": "FERIADO", "salario substituicao": "SALARIO_SUBSTITUICAO",
  "gorjeta": "TAXA_SERVICO", "elogio premiado": "ELOGIO_PAGO_FOLHA", "premiacao por desempenho": "PREMIO",
};
export function rubricType(desc: string): string {
  return RUBRIC_TO_TYPE[norm(desc)] ?? "IGNORAR";
}

/** Descontos que indicam adesão a benefício (código do benefício institucional). */
export const DISCOUNT_TO_BENEFIT: Array<[RegExp, string]> = [
  [/^vale transporte/, "VT"],
  [/^desconto refeicao$/, "ALIMENTACAO"],
  [/^assist(encia)? medica/, "PLANO_SAUDE"],
  [/odontoprev|plano odonto/, "PLANO_ODONTO"],
  [/^farmacia$/, "FARMACIA"],
];
export function benefitFor(desc: string): string | null {
  const n = norm(desc);
  if (/retroativo|indevido|2 via/.test(n)) return null;
  return DISCOUNT_TO_BENEFIT.find(([re]) => re.test(n))?.[1] ?? null;
}

export const contractFor = (vinculo: string) => (norm(vinculo).startsWith("aprendiz") ? "APRENDIZ" : norm(vinculo).startsWith("celetista") ? "CLT" : null);
export const statusFor = (situacao: string) => {
  const n = norm(situacao);
  return n === "demitido" ? "DESLIGADO" : n === "doenca" || n.startsWith("afastado") ? "AFASTADO" : "ATIVO";
};

/** Alíquotas efetivas a partir dos totais da folha (por unidade). */
export function ratesFromTotals(t: { baseInss: number; inssEmpresa: number; rat: number; terceiros: number; baseFgts: number; fgts: number; baseFgtsAprendiz: number; fgtsAprendiz: number }) {
  const pct = (v: number, base: number) => (base > 0 ? Math.round((v / base) * 100 * 1000) / 1000 : null);
  return { INSS_PATRONAL: pct(t.inssEmpresa, t.baseInss), RAT_FAP: pct(t.rat, t.baseInss), TERCEIROS: pct(t.terceiros, t.baseInss), FGTS: pct(t.fgts, t.baseFgts), FGTS_APRENDIZ: pct(t.fgtsAprendiz, t.baseFgtsAprendiz) };
}

/** Data dd/mm/aaaa → AAAA-MM-DD (valida a data). */
export function brDate(s: unknown): string | null {
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const k = `${m[3]}-${m[2]}-${m[1]}`;
  return new Date(`${k}T12:00:00Z`).toISOString().startsWith(k) ? k : null;
}
