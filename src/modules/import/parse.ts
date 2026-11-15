import ExcelJS from "exceljs";
import Papa from "papaparse";
import { suggestField } from "@/modules/import/rules";

export type ParsedSheet = {
  sheetName: string;
  headers: string[];
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
};

/** Valor de célula → texto. Datas viram "AAAA-MM-DD" (horário "HH:MM" quando houver). */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const iso = v.toISOString();
    const time = iso.slice(11, 16);
    return time === "00:00" ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${time}`;
  }
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellText(o.result);
    if (o.text) return String(o.text);
    return "";
  }
  return String(v);
}

/** Escolhe como cabeçalho a primeira linha (até a 10ª) com ao menos 3 colunas reconhecíveis. */
function pickHeader(matrix: string[][]): number {
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const known = matrix[i].filter((h) => h && suggestField(h) !== "ignorar").length;
    if (known >= 3) return i;
  }
  return matrix.findIndex((r) => r.some(Boolean));
}

function toSheet(sheetName: string, matrix: string[][], rowOffset = 1): ParsedSheet {
  const h = pickHeader(matrix);
  if (h < 0) return { sheetName, headers: [], rows: [] };
  const raw = matrix[h];
  // Cabeçalhos vazios ou repetidos recebem nome único (nada é perdido)
  const seen = new Map<string, number>();
  const headers = raw.map((x, i) => {
    let name = (x || "").replace(/\s+/g, " ").trim() || `Coluna ${i + 1}`;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name = `${name} (${n})`;
    return name;
  });
  const rows: ParsedSheet["rows"] = [];
  for (let i = h + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r.some((c) => c && c.trim())) continue; // linha totalmente vazia não é dado
    const values: Record<string, string> = {};
    headers.forEach((name, j) => (values[name] = (r[j] ?? "").trim()));
    rows.push({ rowNumber: i + rowOffset, values });
  }
  // Remove colunas que não têm nenhum valor (comuns em planilhas: colunas H…Z vazias)
  const used = headers.filter((name) => rows.some((r) => r.values[name]));
  for (const r of rows) for (const k of Object.keys(r.values)) if (!used.includes(k)) delete r.values[k];
  return { sheetName, headers: used, rows };
}

export async function parseSpreadsheet(fileName: string, buf: Buffer): Promise<ParsedSheet> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const res = Papa.parse<string[]>(text, { skipEmptyLines: false, delimiter: "" });
    return toSheet("CSV", (res.data as string[][]).map((r) => r.map((c) => String(c ?? ""))));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  // Usa a aba com mais linhas preenchidas
  let best: ExcelJS.Worksheet | undefined;
  for (const ws of wb.worksheets) if (!best || ws.actualRowCount > best.actualRowCount) best = ws;
  if (!best) return { sheetName: "", headers: [], rows: [] };
  const matrix: string[][] = [];
  const maxCol = Math.min(best.columnCount, 60);
  for (let r = 1; r <= best.rowCount; r++) {
    const row = best.getRow(r);
    const out: string[] = [];
    for (let c = 1; c <= maxCol; c++) out.push(cellText(row.getCell(c).value));
    matrix.push(out);
  }
  return toSheet(best.name, matrix);
}

/** "2026-09-14", "14/09/2026", "14/09/26", número serial do Excel → "AAAA-MM-DD" */
/** Confere se a data existe no calendário (rejeita 31/02, 30/02 etc.) e está numa faixa plausível. */
function realDate(iso: string): string | null {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return iso;
}

export function parseDateText(v: string): string | null {
  const iso = parseDateLoose(v);
  return iso ? realDate(iso) : null;
}

function parseDateLoose(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    if (Number(mo) > 12 || Number(d) > 31) return null;
    return `${y}-${mo}-${d}`;
  }
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function parseTimeText(v: string): string | null {
  const m = v.trim().match(/(\d{1,2})[:hH](\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
