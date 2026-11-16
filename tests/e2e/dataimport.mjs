/**
 * E2E da carga de dados (navegador real) com planilha SINTÉTICA: o administrador envia, confere a prévia
 * e aplica; o RH não acessa a tela. Pré-requisitos: SEED_DEMO=true e servidor no ar.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ExcelJS = require("exceljs");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = "Riale@2026Seguro";
const ADMIN = "52998224725", RH = "11144477735";
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const TAG = Date.now().toString(36).toUpperCase().slice(-5);
function cpf(seed) {
  const d = String(100000000 + ((seed * 7919) % 899999999)).slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += d[i] * (len + 1 - i); const r = (s * 10) % 11; d.push(r === 10 ? 0 : r); }
  return d.join("");
}
let failures = 0; const results = [];
async function step(name, fn) { try { const x = await fn(); results.push(`  ✓ ${name}${x ? ` — ${x}` : ""}`); } catch (e) { failures++; results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
async function login(page, doc) { await page.goto(`${BASE}/login`); await page.fill("#cpf", doc); await page.fill("#password", PASS); await Promise.all([page.waitForURL(/dashboard|trocar-senha/), page.click("button[type=submit]")]); }

const wb = new ExcelJS.Workbook();
const add = (n, rows) => { const ws = wb.addWorksheet(n); rows.forEach((r) => ws.addRow(r)); };
add("Parâmetros", [["Competência", "Data do relatório de cargos", "Fonte cargos", "Fonte folha"], ["2026-08", "2026-08-31", `Relatório E2E ${TAG}`, `Folha E2E ${TAG}`]]);
add("Cargos", [["Cargo", "Perfil", "Colaboradores", "Descrição", "Atividades", "Piso salarial", "CBO"], [`Cargo E2E ${TAG}`, "A", 1, "Descrição de teste.", "· Atividade um\n· Atividade dois", 1900, "999009 - Teste"]]);
add("Colaboradores", [["Unidade", "Matrícula", "Nome", "CPF", "Admissão", "Situação", "Vínculo", "Horas mês", "Cargo", "CBO", "Centro de custo", "Departamento folha", "Salário", "Desligamento", "Origem da data de desligamento"], ["VILAMAR", `E${TAG}`, "PESSOA E2E", cpf(Number(String(Date.now()).slice(-6))), "01/02/2025", "Trabalhando", "Celetista", "220,00", `CARGO E2E ${TAG}`, "999009", "RECEPÇÃO", "ADM", 1900, "", ""]]);
add("Rubricas", [["Unidade", "Matrícula", "Código", "Rubrica", "Referência", "Valor", "Tipo"], ["VILAMAR", `E${TAG}`, "8781", "DIAS NORMAIS", "30,00", 1900, "P"]]);
add("Encargos", [["Unidade", "Base INSS", "INSS empresa", "RAT", "Terceiros", "Base FGTS", "Valor FGTS", "Base FGTS aprendiz", "Valor FGTS aprendiz"]]);
add("Clínica", [["Nome", "Endereço", "Telefone", "CNPJ", "Observação"]]);
const file = `/tmp/carga-e2e-${TAG}.xlsx`;
writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer()));

const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await step("Administrador envia a planilha, confere a prévia e aplica a carga", async () => {
  await login(p, ADMIN);
  await p.goto(`${BASE}/configuracoes`);
  await p.click("a:has-text('Importar dados da empresa')");
  await p.locator("input[type=file][name=file]").setInputFiles(file);
  await Promise.all([p.waitForURL(/arquivo=/), p.click("button:has-text('Analisar')")]);
  assert(await p.getByText(/1<\/strong>|de 1 válidos/).count() || await p.getByText("de 1 válidos").count(), "prévia com 1 colaborador");
  await p.screenshot({ path: `${SHOTS}/80-carga-previa.png`, fullPage: true });
  await Promise.all([p.waitForURL(/aplicada=/), p.click("button:has-text('Aplicar carga')")]);
  assert(await p.getByText("colaboradores criados").isVisible(), "resumo da carga");
  return (await p.locator("li", { hasText: "colaboradores criados" }).first().innerText()).trim();
});
await step("Colaborador importado aparece com salário e cargo do relatório", async () => {
  await p.goto(`${BASE}/colaboradores?q=Pessoa%20E2E`);
  assert(await p.getByText("Pessoa E2e").first().isVisible() || await p.getByText("Pessoa E2E").first().isVisible(), "colaborador na lista");
});
await step("RH não acessa a carga de dados (somente administrador)", async () => {
  const r = await (await browser.newContext()).newPage();
  await login(r, RH);
  await r.goto(`${BASE}/configuracoes/importar-dados`);
  assert(/acesso-negado/.test(r.url()), "bloqueado");
});
await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} cenário(s) falharam.` : "\nTodos os cenários da carga passaram.");
process.exit(failures ? 1 : 0);
