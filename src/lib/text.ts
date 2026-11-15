/** Normalização para comparação (duplicidade, mapeamento de planilha). */
export function normalizeText(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome para exibição: espaços extras removidos e iniciais maiúsculas (preposições minúsculas). */
export function tidyName(v: unknown): string {
  const small = new Set(["da", "de", "do", "das", "dos", "e"]);
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Telefone só com dígitos, sem DDI 55; mantém DDD + número (10 ou 11 dígitos). */
export function normalizePhone(v: unknown): string | null {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 8 || d.length === 9) d = "21" + d; // sem DDD → assume Rio de Janeiro
  return d.length === 10 || d.length === 11 ? d : null;
}

export function formatPhone(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

/** Semelhança simples entre nomes (0..1): proporção de palavras em comum. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalizeText(b).split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const w of ta) if (tb.has(w)) common++;
  return common / Math.max(ta.size, tb.size);
}

export function formatMoney(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

/** Converte "R$ 2.600,00", "2600", "2.600" em número. */
export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
