/**
 * E2E da Fase 2 (navegador real): fluxo completo RH → gestor e importação da planilha.
 * Pré-requisitos: banco com SEED_DEMO=true e servidor rodando. Uso: npm run test:e2e:recrutamento
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ExcelJS = require("exceljs");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = "Riale@2026Seguro";
const RH = "11144477735";
const GESTORA = "16899535009"; // Marina Souza — gestora da Recepção (Brisa Barra)
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now().toString(36).toUpperCase();
const phone = (n) => `219${String(Date.now()).slice(-6)}${n}`.slice(0, 11);

let failures = 0;
const results = [];
async function step(name, fn) {
  try {
    const t0 = Date.now();
    const extra = await fn();
    results.push(`  ✓ ${name}${extra ? ` — ${extra}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failures++;
    results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function login(page, cpf) {
  await page.goto(`${BASE}/login`);
  await page.fill("#cpf", cpf);
  await page.fill("#password", PASS);
  await Promise.all([page.waitForURL(/dashboard|trocar-senha/), page.click("button[type=submit]")]);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
let jobUrl = "", jobCode = "";
const A = `Alice Monteiro ${RUN}`, B = `Bruno Esteves ${RUN}`;
const phoneA = phone(1);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

await step("RH cria a vaga: unidade → departamento → gestor vêm da estrutura; código automático", async () => {
  await login(p, RH);
  await p.goto(`${BASE}/vagas/nova`);
  await p.selectOption("select[name=positionId]", { label: "Recepcionista (N2)" });
  await p.selectOption("select[name=unitId]", { label: "Brisa Barra" });
  const dept = await p.$eval("select[name=departmentId]", (s) => s.options[s.selectedIndex]?.text);
  assert(dept === "Recepção", `departamento sugerido pelo cargo: ${dept}`);
  await p.selectOption("select[name=requestingManagerId]", { label: "Marina Souza — Supervisor de Recepção (Recepção)" });
  await p.fill("input[name=expectedSalary]", "2.150,00");
  await p.selectOption("select[name=schedule]", "DOZE_POR_TRINTA_E_SEIS");
  await p.selectOption("select[name=shift]", "NOTURNO");
  await p.fill("input[name=weeklyHours]", "36");
  await Promise.all([p.waitForURL(/\/vagas\/.+\?criada=1/), p.click("button:has-text('Criar vaga')")]);
  jobUrl = p.url().split("?")[0];
  jobCode = (await p.textContent("main p.text-sm.text-stone-500"))?.match(/VAG-\d{4}-\d{4}/)?.[0] ?? "";
  assert(jobCode, "código VAG-AAAA-NNNN");
  return jobCode;
});

await step("RH cadastra candidatos (só nome, telefone e vaga) e o sistema barra duplicidade", async () => {
  const jobId = jobUrl.split("/").pop();
  await p.goto(`${BASE}/candidatos/novo?vaga=${jobId}`);
  const saveAndNext = async () => {
    const before = p.url();
    await p.click("button:has-text('Salvar e cadastrar outro')");
    await p.waitForURL((u) => u.toString() !== before && /candidatos\/novo\?ok=/.test(u.toString()));
    await p.waitForFunction(() => document.querySelector("#fullName")?.value === "");
  };
  await p.fill("#fullName", A);
  await p.fill("#phone", phoneA);
  await saveAndNext();
  await p.fill("#fullName", B);
  await p.fill("#phone", phone(2));
  await p.selectOption("#source", "INDEED");
  await saveAndNext();
  assert((await p.inputValue("#phone")) === "", "formulário limpo para o próximo candidato");
  // mesmo telefone de Alice, nome diferente
  await p.fill("#fullName", `Alice M. ${RUN}`);
  await p.fill("#phone", phoneA);
  await p.click("button[value=ver]");
  await p.waitForSelector("text=É a mesma pessoa?");
  assert(await p.isVisible(`text=${A}`), "mostra o cadastro existente");
  assert((await p.inputValue("#fullName")) === `Alice M. ${RUN}`, "campos preservados");
  await Promise.all([p.waitForURL(/candidatos\/[^/]+$|candidatos\/[^/]+\?/), p.click("button:has-text('Sim, usar este cadastro')")]);
  await p.screenshot({ path: `${SHOTS}/10-candidato.png` });
});

await step("RH agenda os 2 candidatos na mesma vaga e data, em sequência", async () => {
  const jobId = jobUrl.split("/").pop();
  await p.goto(`${BASE}/entrevistas/agendar?vaga=${jobId}&data=${today}`);
  assert(await p.isVisible("dd:has-text('Marina Souza')"), "gestor exibido automaticamente");
  await p.fill("input[placeholder^='Buscar']", RUN);
  await p.check(`label:has-text('${A}') input[type=checkbox]`);
  await p.check(`label:has-text('${B}') input[type=checkbox]`);
  await p.fill("#time", "10:00");
  await p.screenshot({ path: `${SHOTS}/11-agendar.png` });
  await Promise.all([p.waitForURL(/entrevistas\?visao=dia/), p.click("button:has-text('Agendar 2 entrevistas')")]);
  const rowA = p.locator(`li:has-text('${A}')`);
  const rowB = p.locator(`li:has-text('${B}')`);
  assert((await rowA.textContent()).includes("10:00") && (await rowB.textContent()).includes("10:30"), "horários 10:00 e 10:30");
});

await step("RH registra os resultados direto na agenda (meta: menos de 1 minuto cada)", async () => {
  const t0 = Date.now();
  const rowA = p.locator(`li:has-text('${A}')`);
  await rowA.locator("text=Aprovado").first().click();
  await rowA.locator("button:has-text('Registrar resultado')").click();
  await rowA.locator("a:has-text('detalhes')").waitFor(); // a linha passa a mostrar o resultado registrado
  const tA = Date.now() - t0;
  const t1 = Date.now();
  const rowB = p.locator(`li:has-text('${B}')`);
  await rowB.locator("text=Reprovado").first().click();
  await rowB.locator("button:has-text('Registrar resultado')").click();
  await rowB.locator("text=Selecione o motivo").waitFor(); // motivo obrigatório
  await rowB.locator("select[name=reasonId]").selectOption({ label: "Falta de experiência" });
  await rowB.locator("button:has-text('Registrar resultado')").click();
  await rowB.locator("a:has-text('detalhes')").waitFor();
  assert((await rowB.textContent()).includes("Falta de experiência"), "motivo exibido");
  const tB = Date.now() - t1;
  assert(tA < 60000 && tB < 60000, "menos de 1 minuto");
  await p.screenshot({ path: `${SHOTS}/12-agenda-dia.png` });
  return `aprovação em ${(tA / 1000).toFixed(1)}s, reprovação em ${(tB / 1000).toFixed(1)}s (incluindo a validação do motivo)`;
});

await step("Gestora vê o candidato aprovado pelo RH; reprovar exige justificativa; aprova", async () => {
  const g = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(g, GESTORA);
  assert(await g.isVisible("text=Aguardando sua decisão"), "dashboard do gestor");
  await g.goto(`${BASE}/aprovacoes`);
  const card = g.locator(`section:has-text('${A}')`);
  await card.waitFor();
  assert(!(await g.isVisible(`text=${B}`)), "reprovado pelo RH não vai ao gestor");
  await card.locator("text=Reprovar").click();
  await card.locator("button:has-text('Confirmar decisão')").click();
  await card.locator("text=Justifique a reprovação").waitFor();
  await card.locator("text=Aprovar").click();
  await card.locator("textarea[name=justification]").fill("Bom perfil para o noturno");
  await card.locator("button:has-text('Confirmar decisão')").click();
  await card.waitFor({ state: "detached" }); // sai da lista de pendentes
  await g.goto(`${BASE}/aprovacoes?ver=decididas`);
  assert(await g.isVisible(`text=${A}`), "aparece em decididas");
  await g.screenshot({ path: `${SHOTS}/13-aprovacao-gestor.png` });
  await g.context().close();
});

await step("Histórico do candidato mostra cada etapa, com responsável; resultados RH e gestor separados", async () => {
  await p.goto(`${BASE}/candidatos?q=${encodeURIComponent(A)}`);
  await p.click(`text=${A}`);
  await p.waitForSelector("text=Histórico");
  const hist = await p.textContent("section:has(h2:has-text('Histórico'))");
  for (const t of ["Candidato cadastrado", "entrevista agendada", "Resultado do RH", "Encaminhado para avaliação do gestor Marina Souza", "Aprovado pelo gestor (Marina Souza)"]) assert(hist.includes(t), `histórico sem “${t}”`);
  assert(hist.includes("Marina Souza") && hist.includes("Carla Mendes"), "responsáveis");
  assert(await p.isVisible("text=Aprovado pelo gestor"), "bloco do gestor");
  await p.screenshot({ path: `${SHOTS}/14-historico.png`, fullPage: true });
});

await step("Importação da planilha pela tela: análise, revisão e gravação", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Página1");
  ws.addRow(["Unidade", "Data entrevista", "Candidato", "Vaga", "Recrutador", "Aprovado pelo RH?", "Motivo"]);
  ws.addRow(["Brisa Barra ", new Date("2026-10-01T00:00:00Z"), `Gisele Prado ${RUN}`, "Ass. Governança", "Sara Rolim", "Sim/aguarda Aginco", null]);
  ws.addRow(["Imperial", new Date("2026-10-02T00:00:00Z"), `Hugo Lins ${RUN}`, "garçom", "Tatiana", "Não", "Não aderente a cultura da empresa"]);
  ws.addRow(["Imperial", new Date("2026-10-02T00:00:00Z"), `Hugo Lins ${RUN}`, "Garçom", "Tatiana", "Não", "Não aderente a cultura da empresa"]);
  const file = `${SHOTS}/planilha-teste-${RUN}.xlsx`;
  await wb.xlsx.writeFile(file);
  await p.goto(`${BASE}/recrutamento/importar`);
  await p.setInputFiles("input[name=file]", file);
  await Promise.all([p.waitForURL(/recrutamento\/importar\/.+/), p.click("button:has-text('Carregar e analisar')")]);
  assert(await p.isVisible("text=Duplicada na planilha"), "duplicidade detectada");
  await p.screenshot({ path: `${SHOTS}/15-importacao.png`, fullPage: true });
  await p.click("button:has-text('Importar 2 linha(s)')");
  await p.waitForSelector("text=Importação concluída");
  await p.goto(`${BASE}/candidatos?q=${encodeURIComponent(`Gisele Prado ${RUN}`)}`);
  assert(await p.isVisible("text=Avaliação externa"), "status AGINCO preservado");
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} falha(s)` : "\nTodos os cenários do recrutamento passaram.");
process.exit(failures ? 1 : 0);
