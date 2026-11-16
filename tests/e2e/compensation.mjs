/**
 * E2E da Fase 6 (navegador real): painel de remuneração com parcelas separadas, ficha do colaborador
 * (lançamento, conferência do custo), benefício exige origem do valor, Elogio Premiado, PPR, pesquisa
 * salarial com registro de mercado, e restrição de acesso (gestora e RH de unidade).
 * Pré-requisitos: SEED_DEMO=true e servidor no ar. Uso: npm run test:e2e:remuneracao
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = "Riale@2026Seguro";
const RH = "11144477735", RH_BRISA = "39053344705", GESTORA = "16899535009";
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now().toString(36).toUpperCase();
const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
const [y, m] = month.split("-").map(Number);
const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
const brl = (s) => Number(s.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", "."));

let failures = 0;
const results = [];
async function step(name, fn) {
  try { const t0 = Date.now(); const extra = await fn(); results.push(`  ✓ ${name}${extra ? ` — ${extra}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { failures++; results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function login(page, doc) {
  await page.goto(`${BASE}/login`);
  await page.fill("#cpf", doc);
  await page.fill("#password", PASS);
  await Promise.all([page.waitForURL(/dashboard|trocar-senha/), page.click("button[type=submit]")]);
}
const ok = (page, text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 15000 });
const tile = async (page, label) => page.locator("p", { hasText: new RegExp(`^${label}$`) }).first().locator("xpath=following-sibling::p[1]").innerText();

const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let empUrl = "";

await step("Painel da competência: parcelas separadas e custo total = soma das parcelas", async () => {
  await login(p, RH);
  await p.goto(`${BASE}/remuneracao?c=${prev}`);
  const v = {};
  for (const k of ["Remuneração em dinheiro", "Benefícios", "Remuneração total", "Encargos estimados", "Custo total estimado", "Salário-base"]) v[k] = await tile(p, k);
  const total = brl(v["Remuneração total"]), cash = brl(v["Remuneração em dinheiro"]), ben = brl(v["Benefícios"]), enc = brl(v["Encargos estimados"]), cost = brl(v["Custo total estimado"]);
  assert(Math.abs(cash + ben - total) < 0.02, `dinheiro + benefícios = total (${cash} + ${ben} ≠ ${total})`);
  assert(Math.abs(total + enc - cost) < 0.02, `total + encargos = custo (${total} + ${enc} ≠ ${cost})`);
  assert(brl(v["Salário-base"]) < total, "salário-base ≠ remuneração total");
  await p.screenshot({ path: `${SHOTS}/60-remuneracao.png`, fullPage: true });
  return `custo ${v["Custo total estimado"]}`;
});

await step("Ficha do colaborador: lançamento de adicional entra no custo com encargos", async () => {
  await p.locator("tbody tr a").first().click();
  await p.waitForURL(/\/remuneracao\/colaborador\//);
  empUrl = p.url().split("?")[0];
  await p.goto(`${empUrl}?c=${prev}`);
  const line = async (label) => brl(await p.locator("[data-breakdown] div", { hasText: new RegExp(`^${label}`) }).first().locator("span").last().innerText());
  const before = { adic: await line("Adicionais"), cost: await line("Custo total estimado") };
  const f = p.locator("form:has(button:has-text('Lançar'))");
  await f.locator("select[name=typeId]").selectOption({ label: "Horas extras (Adicionais)" });
  await f.locator("input[name=competence]").fill(prev);
  await f.locator("input[name=amount]").fill("100,00");
  await f.locator("button:has-text('Lançar')").click();
  await ok(p, "Lançamento registrado");
  await p.reload();
  const after = { adic: await line("Adicionais"), cost: await line("Custo total estimado") };
  assert(Math.abs(after.adic - before.adic - 100) < 0.01, `adicionais +100 (${before.adic} → ${after.adic})`);
  assert(after.cost - before.cost > 100, `custo sobe mais que 100 (encargos): ${before.cost} → ${after.cost}`);
  await p.screenshot({ path: `${SHOTS}/61-remuneracao-colaborador.png`, fullPage: true });
  return `custo ${before.cost} → ${after.cost}`;
});

await step("Benefícios: valor só com origem informada; TotalPass sem valor aparece como pendente", async () => {
  await p.goto(`${BASE}/remuneracao/beneficios`);
  assert(await p.getByText("valor não informado").first().isVisible(), "pendência visível");
  const card = p.locator("section").filter({ has: p.getByRole("heading", { name: "TotalPass", exact: true }) });
  await card.locator("summary:has-text('Editar')").click();
  await card.locator("input[name=companyCost]").fill("89,90");
  await card.locator("button:has-text('Salvar benefício')").click();
  await card.getByRole("alert").filter({ hasText: "origem dos valores" }).waitFor();
  await card.locator("input[name=valueSource]").fill(`Contrato E2E ${RUN}`);
  await card.locator("button:has-text('Salvar benefício')").click();
  await ok(p, "Benefício salvo");
  await card.getByText(/R\$\s?89,90\/mês/).waitFor();
});

await step("Elogio Premiado e PPR: telas com regra vigente e distribuição", async () => {
  await p.goto(`${BASE}/remuneracao/elogios`);
  assert(await p.getByText(/por elogio aprovado/).isVisible(), "regra vigente");
  const pend = p.locator("li[data-elogio=PENDENTE]").first();
  const before = await p.locator("li[data-elogio=PENDENTE]").count();
  if (before) { await pend.locator("button:has-text('Aprovar')").click(); await p.waitForFunction((n) => document.querySelectorAll("li[data-elogio=PENDENTE]").length === n - 1, before); }
  await p.goto(`${BASE}/remuneracao/ppr`);
  assert(await p.getByText("Atingimento ponderado").first().isVisible(), "PPR");
});

await step("Pesquisa salarial: indicadores e registro de concorrente (base ≠ total)", async () => {
  await p.goto(`${BASE}/pesquisa-salarial?gran=ano`);
  for (const t of ["Pretensão média", "Pretensão mediana", "Pretensão − oferta", "Motivos de recusa pelo candidato", "Benefícios mais valorizados", "Cargos com maior dificuldade de contratação"]) assert(await p.getByText(t).first().isVisible(), t);
  const form = p.locator("form:has(button:has-text('Salvar'))").last();
  await form.locator("select[name=positionId]").selectOption({ label: "Recepcionista" });
  await form.locator("input[name=companyName]").fill(`Hotel E2E ${RUN}`);
  await form.locator("input[name=baseSalary]").fill("2400");
  await form.locator("input[name=totalComp]").fill("2000");
  await form.locator("input[name=reference]").fill("anúncio E2E");
  await form.locator("button:has-text('Salvar')").click();
  await form.getByRole("alert").filter({ hasText: "menor que o salário-base" }).waitFor();
  await form.locator("input[name=totalComp]").fill("3200");
  await form.locator("button:has-text('Salvar')").click();
  await p.getByText(`Hotel E2E ${RUN}`).waitFor();
  await p.screenshot({ path: `${SHOTS}/62-pesquisa-salarial.png`, fullPage: true });
});

await step("Gestora: sem acesso a remuneração e pesquisa salarial (menu e URL)", async () => {
  const g = await (await browser.newContext()).newPage();
  await login(g, GESTORA);
  const menu = await g.locator("nav a").allInnerTexts();
  assert(!menu.some((t) => /Remuneração|Pesquisa salarial/.test(t)), "itens fora do menu");
  for (const u of ["/remuneracao", "/remuneracao/beneficios", "/pesquisa-salarial", empUrl.replace(BASE, "")]) {
    await g.goto(`${BASE}${u}`);
    assert(/acesso-negado/.test(g.url()), `${u} liberado`);
  }
});

await step("RH de unidade: vê só a própria unidade e não altera a política corporativa", async () => {
  const r = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(r, RH_BRISA);
  await r.goto(`${BASE}/remuneracao?c=${prev}`);
  const units = await r.locator("tbody tr td:first-child span.block").allInnerTexts();
  assert(units.length && units.every((u) => u.includes("Brisa Barra")), `só Brisa: ${units.slice(0, 3).join(" | ")}`);
  await r.goto(`${BASE}/remuneracao/beneficios`);
  assert(!(await r.locator("summary:has-text('Editar')").count()), "sem edição de benefícios");
  await r.goto(`${BASE}/remuneracao/parametros`);
  assert(!(await r.locator("button:has-text('Salvar')").count()), "sem edição de encargos");
  return `${units.length} colaborador(es)`;
});

await step("Celular: remuneração e pesquisa salarial sem rolagem horizontal da página", async () => {
  const mob = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(mob, RH);
  for (const u of [`/remuneracao?c=${prev}`, "/pesquisa-salarial", "/remuneracao/beneficios"]) {
    await mob.goto(`${BASE}${u}`);
    const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${u}: ${overflow}px`);
  }
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} cenário(s) falharam.` : "\nTodos os cenários de remuneração passaram.");
process.exit(failures ? 1 : 0);
