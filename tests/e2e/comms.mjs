/**
 * E2E da Fase 3 (navegador real): revisão/edição do aviso ao gestor, encerramento manual do dia,
 * painel de configuração e proteção da rota do cron. Requer servidor rodando e SEED_DEMO.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });
const RUN = Date.now().toString(36).toUpperCase();
const NT = RUN.charAt(0) + RUN.slice(1).toLowerCase();

let failures = 0;
const results = [];
async function step(name, fn) {
  try { const r = await fn(); results.push(`  ✓ ${name}${r ? ` — ${r}` : ""}`); }
  catch (e) { failures++; results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 30 * 86400000));

await step("Rota do fechamento automático exige o segredo do cron", async () => {
  const r = await fetch(`${BASE}/api/cron/tick`);
  assert(r.status === 401, `sem segredo → ${r.status}`);
  if (process.env.CRON_SECRET) {
    const ok = await fetch(`${BASE}/api/cron/tick`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert(ok.status === 200, `com segredo → ${ok.status}`);
  }
});

await step("RH agenda pedindo revisão; edita o texto e envia; mensagem entra na fila (não simulada)", async () => {
  await p.goto(`${BASE}/login`);
  await p.fill("#cpf", "11144477735");
  await p.fill("#password", "Riale@2026Seguro");
  await Promise.all([p.waitForURL(/dashboard/), p.click("button[type=submit]")]);
  // candidato novo na vaga de Recepcionista da Brisa (gestora Marina)
  await p.goto(`${BASE}/vagas?q=Recepcionista`);
  await Promise.all([p.waitForURL(/\/vagas\/[^?]+/), p.click("tr:has-text('Marina Souza') a:has-text('Recepcionista') >> nth=0")]);
  const jobId = p.url().split("/").pop().split("?")[0];
  await p.goto(`${BASE}/candidatos/novo?vaga=${jobId}`);
  await p.fill("#fullName", `Revisao Email ${RUN}`);
  await p.fill("#phone", `2196${String(Date.now()).slice(-7)}`);
  await Promise.all([p.waitForURL(/entrevistas\/agendar/), p.click("button:has-text('Salvar e agendar entrevista')")]);
  await p.fill("#date", day);
  await p.fill("#time", "10:00");
  await p.check("input[name=reviewEmail]");
  await Promise.all([p.waitForURL(/aviso=revisar/), p.click("button:has-text('Agendar entrevista')")]);
  assert(await p.isVisible("text=aguarda sua revisão"), "banner de revisão");
  await p.goto(`${BASE}/comunicacoes`);
  const item = p.locator("li:has-text('Aguardando sua revisão')").first();
  await item.locator("a:has-text('Ver / editar texto')").click();
  await p.waitForSelector("textarea[name=body]");
  const body = await p.inputValue("textarea[name=body]");
  assert(body.includes("prezado(a) Marina Souza") && body.includes(`Revisao Email ${NT}`), "texto gerado com gestor e candidato");
  await p.screenshot({ path: `${SHOTS}/30-editar-aviso.png` });
  await p.fill("textarea[name=body]", body.replace("Atenciosamente,", "Qualquer dúvida, estamos à disposição.\n\nAtenciosamente,"));
  await p.click("button:has-text('Salvar e enviar agora')");
  await p.waitForSelector("text=Emitida em"); // a página passa a mostrar a mensagem emitida
  const sent = await p.textContent("pre");
  assert(sent.includes("Qualquer dúvida, estamos à disposição."), "o texto editado é o que foi emitido");
  await p.goto(`${BASE}/comunicacoes`);
  const row = p.locator(`tr:has-text('Marina Souza')`).first();
  await row.waitFor();
  const queued = await p.locator("tr:has-text('Agenda')").first().textContent();
  assert(/Na fila|Enviada/.test(queued), "mensagem na fila de envio");
  await p.screenshot({ path: `${SHOTS}/31-comunicacoes.png`, fullPage: true });
  return process.env.EMAIL_PROVIDER ? "enviado pelo provedor" : "na fila — e-mail não configurado neste ambiente";
});

await step("Sem configuração, o painel mostra exatamente as variáveis que faltam", async () => {
  if (process.env.EMAIL_PROVIDER) return "provedor configurado";
  await p.goto(`${BASE}/comunicacoes`);
  assert(await p.isVisible("text=O envio de e-mails ainda não está configurado"), "aviso");
  for (const v of ["EMAIL_PROVIDER", "EMAIL_FROM", "SMTP_HOST", "SMTP_PASSWORD", "CRON_SECRET"]) assert(await p.isVisible(`code:has-text('${v}')`), v);
});

await step("RH encerra a agenda do dia manualmente (antes do horário)", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  // agenda uma entrevista para hoje (vaga da Marina) e registra o resultado
  await p.goto(`${BASE}/vagas?q=Recepcionista`);
  await Promise.all([p.waitForURL(/\/vagas\/[^?]+/), p.click("tr:has-text('Marina Souza') a:has-text('Recepcionista') >> nth=0")]);
  const jobId = p.url().split("/").pop().split("?")[0];
  await p.goto(`${BASE}/candidatos/novo?vaga=${jobId}`);
  await p.fill("#fullName", `Fechamento Hoje ${RUN}`);
  await p.fill("#phone", `2195${String(Date.now()).slice(-7)}`);
  await Promise.all([p.waitForURL(/entrevistas\/agendar/), p.click("button:has-text('Salvar e agendar entrevista')")]);
  await p.fill("#date", today);
  await p.fill("#time", "23:00");
  await Promise.all([p.waitForURL(/entrevistas\?visao=dia/), p.click("button:has-text('Agendar entrevista')")]);
  const row = p.locator(`li:has-text('Fechamento Hoje ${NT}')`);
  await row.locator("text=Não compareceu").first().click();
  await row.locator("button:has-text('Registrar resultado')").click();
  await row.locator("a:has-text('detalhes')").waitFor();
  await p.goto(`${BASE}/comunicacoes?data=${today}`);
  const btn = p.locator("button:has-text('Encerrar agenda')");
  if (!(await btn.count())) {
    assert(await p.isVisible("text=Agenda encerrada") || await p.isVisible("text=Nenhuma entrevista nesta data"), "estado do dia");
    return "dia já encerrado ou sem entrevistas";
  }
  await btn.click();
  await p.waitForSelector("text=Agenda encerrada às");
  await p.goto(`${BASE}/comunicacoes`);
  assert(await p.isVisible("a:has-text('Fechamento do dia')"), "fechamento listado nas comunicações emitidas");
  await p.screenshot({ path: `${SHOTS}/32-fechamento.png` });
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} falha(s)` : "\nTodos os cenários de comunicação passaram.");
process.exit(failures ? 1 : 0);
