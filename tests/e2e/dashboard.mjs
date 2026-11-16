/**
 * E2E da Fase 4 (navegador real): painel de indicadores, filtros, metas de SLA e exportações.
 * Confere que o número mostrado na tela é o mesmo do Excel exportado com os mesmos filtros.
 * Pré-requisitos: banco com SEED_DEMO=true e servidor rodando. Uso: npm run test:e2e:indicadores
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ExcelJS = require("exceljs");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = "Riale@2026Seguro";
const RH = "11144477735";
const GESTORA = "16899535009"; // gestora da Recepção (Brisa Barra) no seed de demonstração
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const results = [];
async function step(name, fn) {
  try { const extra = await fn(); results.push(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`); }
  catch (e) { failures++; results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function login(page, cpf) {
  await page.goto(`${BASE}/login`);
  await page.fill("#cpf", cpf);
  await page.fill("#password", PASS);
  await Promise.all([page.waitForURL(/dashboard|trocar-senha/), page.click("button[type=submit]")]);
}
const kpi = (page, label) => page.locator("p", { hasText: new RegExp(`^${label}$`) }).first().locator("xpath=following-sibling::p[1]").innerText();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const year = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 4);

await step("RH abre o painel: seções de recrutamento, conversão, produtividade e SLA", async () => {
  await login(p, RH);
  await p.goto(`${BASE}/relatorios?gran=ano&ref=${year}-01-01`);
  for (const h of ["Recrutamento no período", "Conversão", "Produtividade", "SLA do processo"]) assert(await p.getByText(h, { exact: true }).first().isVisible(), `seção ${h}`);
  await p.screenshot({ path: `${SHOTS}/40-indicadores.png`, fullPage: true });
  return `ano ${year}: ${await kpi(p, "Entrevistas agendadas")} entrevistas agendadas`;
});

await step("Tela e Excel exportado mostram os mesmos números (mesmos filtros)", async () => {
  const screen = Number(await kpi(p, "Entrevistas agendadas"));
  const hires = Number(await kpi(p, "Contratações"));
  const res = await p.request.get(`${BASE}/api/v1/reports/xlsx?gran=ano&ref=${year}-01-01`);
  assert(res.ok(), `xlsx HTTP ${res.status()}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.body());
  const resumo = wb.getWorksheet("Resumo");
  const rows = {};
  resumo.eachRow((r) => { rows[String(r.getCell(1).value)] = r.getCell(2).value; });
  assert(rows["Entrevistas agendadas"] === screen, `Excel ${rows["Entrevistas agendadas"]} × tela ${screen}`);
  assert(rows["Contratações (admissões)"] === hires, `contratações Excel ${rows["Contratações (admissões)"]} × tela ${hires}`);
  assert(wb.getWorksheet("Metodologia") && wb.getWorksheet("Validação"), "abas de metodologia e validação");
  return `${screen} entrevistas · ${hires} contratações`;
});

await step("PDF exportado é um PDF válido", async () => {
  const res = await p.request.get(`${BASE}/api/v1/reports/pdf?gran=ano&ref=${year}-01-01`);
  const body = await res.body();
  assert(res.ok() && body.subarray(0, 5).toString() === "%PDF-", `pdf HTTP ${res.status()}`);
  assert(/attachment/.test(res.headers()["content-disposition"] ?? ""), "download");
  return `${(body.length / 1024).toFixed(0)} KB`;
});

await step("Filtros: granularidade, navegação de período e unidade", async () => {
  await p.click("text=Mês");
  await p.waitForURL(/gran=mes/);
  await Promise.all([p.waitForURL(/ref=\d{4}-12-01/), p.click("[aria-label='Período anterior']")]);
  const units = await p.$$eval("select[name=unidade] option", (o) => o.map((x) => x.value).filter(Boolean));
  assert(units.length >= 1, "opções de unidade");
  await p.selectOption("select[name=unidade]", units[0]);
  await Promise.all([p.waitForURL(/unidade=/), p.click("button:has-text('Aplicar')")]);
  assert(/gran=mes/.test(p.url()) && /ref=\d{4}-12-01/.test(p.url()), "mantém período e granularidade ao filtrar");
  return p.url().split("?")[1];
});

await step("Metas de SLA: RH cadastra meta padrão, painel compara com a média, RH remove", async () => {
  await p.goto(`${BASE}/relatorios/metas`);
  await p.selectOption("#stage", "ENTREVISTA_APROVACAO_RH");
  await p.fill("#targetDays", "2.5");
  await p.click("button:has-text('Salvar meta')");
  await p.getByText("2,5 dia(s)").first().waitFor();
  await p.goto(`${BASE}/relatorios?gran=ano&ref=${year}-01-01`);
  assert(await p.getByText("meta 2,5 d").first().isVisible(), "meta aparece na etapa");
  await p.goto(`${BASE}/relatorios/metas`);
  const row = p.locator("li", { hasText: "2,5 dia" }).first();
  await row.locator("button:has-text('Remover')").click();
  await row.waitFor({ state: "detached" });
});

await step("Gestora: vê só o próprio escopo e não configura metas", async () => {
  const g = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(g, GESTORA);
  await g.goto(`${BASE}/relatorios?gran=ano&ref=${year}-01-01`);
  const depts = await g.$$eval("select[name=departamento] option", (o) => o.map((x) => x.value).filter(Boolean));
  const units = await g.$$eval("select[name=unidade] option", (o) => o.map((x) => x.value).filter(Boolean));
  assert(units.length <= 1, `unidades visíveis: ${units.length}`);
  await g.goto(`${BASE}/relatorios/metas`);
  assert(!(await g.locator("button:has-text('Salvar meta')").count()), "gestora não pode salvar metas");
  const res = await g.request.get(`${BASE}/api/v1/reports/xlsx?gran=ano&ref=${year}-01-01`);
  assert(res.ok(), "gestora exporta o próprio escopo");
  return `departamentos: ${depts.join(", ") || "—"}`;
});

await step("Celular: painel legível sem rolagem horizontal", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(m, RH);
  await m.goto(`${BASE}/relatorios?gran=ano&ref=${year}-01-01`);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await m.screenshot({ path: `${SHOTS}/41-indicadores-celular.png`, fullPage: true });
  assert(overflow <= 1, `rolagem horizontal de ${overflow}px`);
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} cenário(s) falharam.` : "\nTodos os cenários de indicadores passaram.");
process.exit(failures ? 1 : 0);
