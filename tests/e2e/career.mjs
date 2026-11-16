/**
 * E2E da Fase 7 (navegador real): trilha visual, descritivo com requisitos mínimos × PDI, cadastro e
 * publicação de descritivo, carreira do colaborador (elegibilidade, PDI), prévia do portal, indicadores,
 * banco de talentos, escopo da gestora e celular. Pré-requisitos: SEED_DEMO=true e servidor no ar.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = "Riale@2026Seguro";
const RH = "11144477735", GESTORA = "16899535009";
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now().toString(36).toUpperCase();

let failures = 0;
const results = [];
async function step(name, fn) {
  try { const t0 = Date.now(); const extra = await fn(); results.push(`  ✓ ${name}${extra ? ` — ${extra}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { failures++; results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function login(page, doc) {
  await page.goto(`${BASE}/login`); await page.fill("#cpf", doc); await page.fill("#password", PASS);
  await Promise.all([page.waitForURL(/dashboard|trocar-senha/), page.click("button[type=submit]")]);
}
const ok = (page, text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 15000 });

const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let recUrl = "", careerUrl = "";

await step("Trilha vigente em representação visual, com requisitos e aviso de que não há promoção automática", async () => {
  await login(p, RH);
  await p.goto(`${BASE}/carreira`);
  const flow = p.locator("ol[data-path='Recepção (demonstração)'] > li");
  assert((await flow.count()) === 3, `3 cargos na trilha (${await flow.count()})`);
  assert(await p.getByText("Promoção não é automática").first().isVisible(), "aviso");
  await p.screenshot({ path: `${SHOTS}/70-trilhas.png`, fullPage: true });
  return (await p.locator("ol[data-path='Recepção (demonstração)'] > li a").allInnerTexts()).join(" → ");
});

await step("Descritivo: requisitos mínimos separados das competências desenvolvíveis pelo PDI", async () => {
  await p.goto(`${BASE}/cargos`);
  await p.locator("a", { hasText: /^Recepcionista$/ }).first().click();
  await p.waitForURL(/\/cargos\/[a-z0-9]+$/);
  recUrl = p.url();
  const d = p.locator("[data-descriptor]");
  assert(await d.getByText("Requisitos mínimos — obrigatórios para ocupar o cargo").isVisible(), "bloco de requisitos");
  assert(await d.getByText("Desenvolvíveis pelo PDI").isVisible(), "bloco do PDI");
  assert(await d.getByText("Supervisor de Recepção").isVisible(), "superior direto");
  await p.screenshot({ path: `${SHOTS}/71-descritivo.png`, fullPage: true });
});

await step("Cadastro de descritivo: rascunho → publicação exige o documento de origem → vigente", async () => {
  await p.goto(`${BASE}/cargos`);
  await p.locator("a", { hasText: /^Barman$/ }).first().click();
  await p.waitForURL(/\/cargos\/[a-z0-9]+$/);
  await p.fill("textarea[name=objective]", `Preparar e servir bebidas (E2E ${RUN})`);
  await p.fill("textarea[name=responsibilities]", "Preparar drinks\nControlar estoque do bar");
  await p.fill("textarea[name=minRequirements]", "Ensino fundamental completo");
  await p.fill("textarea[name=competencies]", "Atendimento ao cliente");
  await p.click("button:has-text('Salvar rascunho')");
  await ok(p, "Rascunho do descritivo salvo");
  await p.click("button:has-text('Publicar como vigente')");
  await p.getByRole("alert").filter({ hasText: "documento institucional de origem" }).waitFor();
  await p.fill("input[name=sourceRef]", `Documento E2E ${RUN}`);
  await p.click("button:has-text('Salvar rascunho')");
  await ok(p, "Rascunho do descritivo salvo");
  await p.click("button:has-text('Publicar como vigente')");
  await p.getByText(/descritivo vigente v\d/).first().waitFor();
});

await step("Carreira do colaborador: próximo passo, elegibilidade objetiva e item de PDI", async () => {
  await p.goto(`${BASE}/colaboradores?status=ATIVO`);
  const rows = p.locator("tbody tr", { hasText: "Recepcionista" });
  await rows.first().locator("a").first().click();
  await p.waitForURL(/\/colaboradores\/[a-z0-9]+$/);
  await p.getByRole("link", { name: "Carreira", exact: true }).click();
  await p.waitForURL(/\/carreira\/colaborador\//);
  careerUrl = p.url();
  const next = p.locator("[data-next='Supervisor de Recepção']");
  assert(await next.count(), "próximo passo para supervisor");
  const badge = await next.locator("span").filter({ hasText: /comitê|avaliação|tempo|PDI/ }).first().innerText();
  await p.fill("#gapDescription", "Liderança");
  await p.fill("input[name=developmentGoal]", "Conduzir a passagem de turno");
  await p.fill("input[name=recommendedAction]", "Acompanhamento do supervisor");
  await p.click("button:has-text('Criar item do PDI')");
  await ok(p, "Item do PDI criado");
  await p.screenshot({ path: `${SHOTS}/72-carreira-colaborador.png`, fullPage: true });
  return badge;
});

await step("Prévia do portal do colaborador: cargo, trilha, requisitos × PDI, sem salário individual", async () => {
  await p.click("a:has-text('Prévia do portal do colaborador')");
  await p.waitForURL(/\/carreira\/portal\//);
  for (const t of ["Meu cargo", "Minha trilha e próximos níveis", "Meu PDI", "Meu histórico profissional", "Requisitos mínimos", "O que desenvolver (PDI)"]) assert(await p.getByText(t).first().isVisible(), t);
  assert(await p.getByText(/Promoção não é automática/).first().isVisible(), "aviso");
  assert(await p.getByText("Liderança").first().isVisible(), "PDI criado aparece");
});

await step("Indicadores de carreira: elegibilidade, movimentações, sucessores e distribuição na faixa", async () => {
  await p.goto(`${BASE}/carreira/indicadores`);
  for (const t of ["Atendem tempo e nota", "Taxa de promoção", "Vagas preenchidas internamente", "Potenciais sucessores (cargos de liderança nas trilhas vigentes)", "Distribuição salarial na faixa (salário-base vigente dos ativos)"]) assert(await p.getByText(t).first().isVisible(), t);
  await p.screenshot({ path: `${SHOTS}/73-carreira-indicadores.png`, fullPage: true });
});

await step("Banco de talentos: candidato compatível com outra posição e perfil na ficha do candidato", async () => {
  await p.goto(`${BASE}/banco-de-talentos`);
  const entry = p.locator("li", { hasText: "Supervisor de Recepção" }).first();
  assert(await entry.count(), "candidato no banco para supervisor");
  await entry.locator("a").first().click();
  await p.waitForURL(/\/candidatos\//);
  assert(await p.getByText("Perfil e potencial").isVisible(), "perfil");
  assert(await p.locator("[data-matches] li", { hasText: "Supervisor de Recepção" }).count(), "supervisor compatível");
});

await step("Gestora: vê trilhas e descritivos, sem editar e sem salários", async () => {
  const g = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(g, GESTORA);
  await g.goto(`${BASE}/carreira`);
  assert(await g.locator("ol[data-path]").count(), "trilha visível");
  assert(!(await g.getByText("Nova trilha").count()), "sem edição");
  assert(!(await g.getByText(/ref\. R\$/).count()), "sem salário na trilha");
  await g.goto(recUrl);
  assert(!(await g.getByText("Faixa salarial (geral)").count()), "sem faixa no cargo");
  assert(!(await g.locator("button:has-text('Salvar rascunho')").count()), "sem edição do descritivo");
  await g.goto(`${BASE}/carreira/indicadores`);
  assert(await g.getByText("Distribuição salarial visível apenas").isVisible(), "distribuição oculta");
});

await step("Celular: trilhas, descritivo e portal sem rolagem horizontal da página", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(m, RH);
  for (const u of [`${BASE}/carreira`, recUrl, careerUrl.replace("/carreira/colaborador/", "/carreira/portal/")]) {
    await m.goto(u);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${u.replace(BASE, "")}: ${overflow}px`);
  }
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} cenário(s) falharam.` : "\nTodos os cenários de carreira passaram.");
process.exit(failures ? 1 : 0);
