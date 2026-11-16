/**
 * E2E da Fase 5 (navegador real): candidato aprovado → admissão (dados, documentos com anexo,
 * exame e ASO) → colaborador com histórico seletivo → avaliação do marco → desligamento →
 * permanência; escopo da gestora; configurações. Pré-requisitos: SEED_DEMO=true e servidor no ar.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = "Riale@2026Seguro";
const RH = "11144477735";
const GESTORA = "16899535009";
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now().toString(36).toUpperCase();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function cpf(seed) {
  const d = String(100000000 + ((seed * 7919) % 899999999)).slice(0, 9).split("").map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += d[i] * (len + 1 - i); const r = (s * 10) % 11; d.push(r === 10 ? 0 : r); }
  return d.join("");
}

let failures = 0;
const results = [];
async function step(name, fn) {
  try { const t0 = Date.now(); const extra = await fn(); results.push(`  ✓ ${name}${extra ? ` — ${extra}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { failures++; results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function login(page, doc) {
  await page.goto(`${BASE}/login`);
  await page.fill("#cpf", doc);
  await page.fill("#password", PASS);
  await Promise.all([page.waitForURL(/dashboard|trocar-senha/), page.click("button[type=submit]")]);
}
const ok = async (page, text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 15000 });

const prep = JSON.parse(execFileSync("npx", ["tsx", "--env-file=.env", "tests/e2e/prep-admission.ts", RUN], { encoding: "utf8" }).trim().split("\n").at(-1));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
let admUrl = "", empUrl = "";

await step("Candidato aprovado em todas as etapas é encaminhado para admissão pela ficha", async () => {
  await login(p, RH);
  await p.goto(`${BASE}/candidatos/${prep.candidateId}`);
  await Promise.all([p.waitForURL(/\/admissoes\/[a-z0-9]+$/), p.click("button:has-text('Encaminhar para admissão')")]);
  admUrl = p.url();
  assert(await p.getByText(/Faltam \d+ item/).isVisible(), "lista do que falta");
  assert(await p.locator("button:has-text('Confirmar contratação')").isDisabled(), "confirmar bloqueado");
  return (await p.locator("h1").innerText());
});

await step("Dados da admissão: data, CPF, escala — pré-preenchidos pela vaga e validados", async () => {
  await p.fill("input[name=cpf]", "11111111111");
  await p.click("button:has-text('Salvar dados')");
  await p.getByRole("alert").first().waitFor();
  await p.fill("input[name=admissionDate]", today);
  await p.fill("input[name=cpf]", cpf(Number(String(Date.now()).slice(-6))));
  await p.click("button:has-text('Salvar dados')");
  await ok(p, "Dados da admissão salvos");
  assert(await p.getByText(/CPF do candidato \(atual: \d{3}\.\*\*\*/).count() || await p.getByText(/atual:/).count(), "CPF mascarado");
  const salary = await p.inputValue("input[name=salary]");
  assert(salary === "2200,00", `salário da oferta: ${salary}`);
});

await step("Checklist: anexo cifrado (Pendente → Recebido), recusa com motivo e aprovação dos obrigatórios", async () => {
  const rg = p.locator("li[data-doc=RG_CNH]");
  writeFileSync("/tmp/rg-e2e.pdf", "%PDF-1.4\n% documento E2E\n");
  await rg.locator("input[type=file]").setInputFiles("/tmp/rg-e2e.pdf");
  await rg.locator("button:has-text('Anexar')").click();
  await rg.getByText("rg-e2e.pdf").waitFor();
  assert(await rg.getByText("Recebido").count(), "status Recebido após anexar");
  const dl = await p.request.get(BASE + (await rg.locator("a:has-text('rg-e2e.pdf')").getAttribute("href")));
  assert(dl.ok() && (await dl.text()).includes("documento E2E"), "download pelo RH");
  const foto = p.locator("li[data-doc=FOTO]");
  await foto.locator("select[name=status]").selectOption("RECUSADO");
  await foto.locator("button:has-text('Salvar')").click();
  await p.getByRole("alert").filter({ hasText: "motivo da recusa" }).first().waitFor();
  await foto.locator("input[name=refusalReason]").fill("Foto desfocada");
  await foto.locator("button:has-text('Salvar')").click();
  await foto.getByText("Recusado: Foto desfocada").waitFor();
  const codes = await p.$$eval("li[data-doc]", (els) => els.filter((e) => !e.textContent.includes("não se aplica") && !e.textContent.includes("opcional")).map((e) => e.getAttribute("data-doc")));
  for (const code of codes) {
    const row = p.locator(`li[data-doc=${code}]`);
    await row.locator("select[name=status]").selectOption("APROVADO");
    await row.locator("button:has-text('Salvar')").click();
    await row.locator("span", { hasText: /^Aprovado$/ }).first().waitFor();
  }
  return `${codes.length} obrigatórios aprovados`;
});

await step("Exame admissional: agendamento, realização e ASO apto liberam a confirmação", async () => {
  await p.selectOption("select[name=clinicId]", { index: 1 });
  await p.fill("input[name=date]", today);
  await p.click("button:has-text('Agendar exame')");
  await p.locator("li[data-exam=AGENDADO]").waitFor();
  await p.locator("li[data-exam=AGENDADO] button:has-text('Realizado')").click();
  await p.locator("li[data-exam=REALIZADO]").waitFor();
  await p.locator("li[data-exam=REALIZADO] select[name=result]").selectOption("APTO");
  await p.locator("li[data-exam=REALIZADO] button:has-text('Registrar ASO')").click();
  await p.getByText("ASO recebido — apto").waitFor();
  await p.getByText("Tudo pronto para confirmar a contratação").waitFor();
  await p.screenshot({ path: `${SHOTS}/50-admissao.png`, fullPage: true });
});

await step("Confirmação converte em colaborador: matrícula, marcos 30/45/90 e histórico seletivo preservado", async () => {
  await Promise.all([p.waitForURL(/\/colaboradores\/[a-z0-9]+\?admitido=1/), p.click("button:has-text('Confirmar contratação')")]);
  empUrl = p.url().split("?")[0];
  for (const d of ["30", "45", "90"]) assert(await p.locator(`li[data-milestone="${d}"]`).count(), `marco ${d}`);
  assert(await p.getByRole("heading", { name: "Histórico seletivo" }).isVisible(), "histórico seletivo");
  assert(await p.getByText("Aprovado pelo RH (1ª entrevista)").isVisible(), "evento do RH preservado");
  assert(await p.getByText(/Contratado\(a\): Recepcionista/).isVisible(), "evento de contratação");
  await p.screenshot({ path: `${SHOTS}/51-colaborador.png`, fullPage: true });
  return (await p.locator("h1").innerText()) + " · " + (await p.getByText(/Matrícula \d{6}/).first().innerText()).split("·")[0].trim();
});

await step("Avaliação do marco de 30 dias e desligamento durante a experiência", async () => {
  const m30 = p.locator('li[data-milestone="30"]');
  await m30.locator("select[name=outcome]").selectOption("SEGUE");
  await m30.locator("button:has-text('Registrar')").click();
  await m30.getByText("Aprovado — segue na experiência").first().waitFor();
  await p.selectOption("select[name=type]", "RESCISAO_ANTECIPADA_COLABORADOR");
  await p.fill("textarea[name=reason]", "Mudança de cidade (teste E2E)");
  await p.click("button:has-text('Registrar desligamento')");
  await p.getByText(/Desligado em .* \(durante a experiência\)/).waitFor();
  assert(await p.locator('li[data-milestone="90"]').getByText("Encerrado (desligamento)").count(), "marcos encerrados");
});

await step("Acompanhamento da experiência e painel de permanência carregam com dados calculados", async () => {
  await p.goto(`${BASE}/colaboradores/experiencia`);
  assert(await p.getByText(/Vencem nos próximos|Em atraso|Próximas semanas/).first().isVisible(), "agenda");
  await p.goto(`${BASE}/relatorios/permanencia?gran=ano&ref=${today.slice(0, 4)}-01-01`);
  for (const t of ["Retenção em 30 dias", "Retenção em 45 dias", "Retenção em 90 dias", "Por unidade", "Por cargo"]) assert(await p.getByText(t).first().isVisible(), t);
  await p.screenshot({ path: `${SHOTS}/52-permanencia.png`, fullPage: true });
  const term = await p.locator("p", { hasText: /^Desligamentos$/ }).first().locator("xpath=following-sibling::p[1]").innerText();
  return `desligamentos no ano: ${term}`;
});

await step("Configurações: nova clínica e novo item do checklist entram nos processos em andamento", async () => {
  await p.goto(`${BASE}/admissoes/configuracoes`);
  await p.fill("form:has(button:has-text('Adicionar clínica')) input[name=name]", `Clínica E2E ${RUN}`);
  await p.click("button:has-text('Adicionar clínica')");
  await ok(p, "Clínica salva");
  await p.fill("form:has(button:has-text('Adicionar ao checklist')) input[name=label]", `Declaração E2E ${RUN}`);
  await p.selectOption("form:has(button:has-text('Adicionar ao checklist')) select[name=category]", "OUTROS");
  await p.click("button:has-text('Adicionar ao checklist')");
  await ok(p, "Checklist atualizado");
  await p.goto(`${BASE}/admissoes`);
  const open = p.locator("tbody a[href^='/admissoes/']").first();
  await open.click();
  await p.getByText(`Declaração E2E ${RUN}`).first().waitFor();
  // desativa para não afetar outros testes
  await p.goto(`${BASE}/admissoes/configuracoes`);
  const item = p.locator("li", { hasText: `Declaração E2E ${RUN}` });
  await item.locator("summary").click();
  await item.locator("input[name=active][type=checkbox]").uncheck();
  await item.locator("button:has-text('Salvar')").click();
  await ok(p, "Checklist atualizado");
});

await step("Gestora: sem acesso a admissões; vê a própria equipe sem salário", async () => {
  const g = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(g, GESTORA);
  await g.goto(`${BASE}/admissoes`);
  assert(/acesso-negado/.test(g.url()), "admissões bloqueadas");
  await g.goto(`${BASE}/colaboradores?status=TODOS`);
  const rows = await g.locator("tbody tr").count();
  assert(rows >= 1, "equipe visível");
  const units = await g.locator("tbody tr td:nth-child(4)").allInnerTexts();
  assert(units.every((u) => u.includes("Brisa Barra")), `só a unidade da gestora: ${units.join(" | ")}`);
  await g.goto(empUrl);
  assert(await g.getByText("restrito").first().isVisible(), "salário restrito");
  assert(!(await g.locator("button:has-text('Registrar desligamento')").count()), "gestora não desliga");
  return `${rows} colaborador(es)`;
});

await step("Celular: admissão e colaborador sem rolagem horizontal", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(m, RH);
  for (const url of [admUrl, empUrl, `${BASE}/relatorios/permanencia`]) {
    await m.goto(url);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${url.replace(BASE, "")}: rolagem horizontal de ${overflow}px`);
  }
  await m.goto(admUrl);
  await m.screenshot({ path: `${SHOTS}/53-admissao-celular.png`, fullPage: true });
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} cenário(s) falharam.` : "\nTodos os cenários da admissão passaram.");
process.exit(failures ? 1 : 0);
