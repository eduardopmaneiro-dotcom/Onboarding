/* eslint-disable @typescript-eslint/no-require-imports -- script CommonJS (Playwright via require) */
/**
 * E2E do PRIMEIRO ACESSO (banco de produção vazio, sem SEED_DEMO).
 * Simula o deploy na Vercel: npm run vercel-build && npm start, com
 * BOOTSTRAP_ADMIN_CPF e BOOTSTRAP_TOKEN definidos. Uso:
 *   BASE_URL=http://localhost:3001 BOOTSTRAP_ADMIN_CPF=... BOOTSTRAP_TOKEN=... node tests/e2e/first-access.cjs
 */
const { chromium } = require("playwright");
const B = process.env.BASE_URL ?? "http://localhost:3001";
const ADMIN_CPF = (process.env.BOOTSTRAP_ADMIN_CPF ?? "").replace(/\D/g, "");
const TOKEN = process.env.BOOTSTRAP_TOKEN ?? "";
const ok = (c, m) => { if (!c) throw new Error(m); console.log("  ✓ " + m); };
(async () => {
  require("node:fs").mkdirSync("tests/e2e/screenshots", { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(B + "/login");
  ok(await p.isVisible("text=Fazer o primeiro acesso"), "login mostra aviso de primeiro acesso (banco sem usuários)");
  await p.screenshot({ path: "tests/e2e/screenshots/pa-login.png" });
  await p.click("text=Fazer o primeiro acesso"); await p.waitForURL(/primeiro-acesso/); await p.waitForLoadState("networkidle");
  const fill = async (token, cpf) => {
    await p.fill("#cpf", cpf); await p.fill("input[name=name]", "Administrador Principal"); await p.fill("input[name=email]", "admin.teste@rialehoteis.com.br");
    await p.fill("input[name=token]", token); await p.fill("input[name=password]", "Riale#Admin2026"); await p.fill("input[name=confirm]", "Riale#Admin2026");
    await p.click("button:has-text('Criar administrador')");
    await p.waitForTimeout(300);
    await p.waitForFunction(() => !document.querySelector("form[aria-busy=true]"), null, { timeout: 30000 }).catch(() => {});
  };
  await fill("codigo-errado-123456", ADMIN_CPF);
  await p.waitForSelector("text=CPF ou código de configuração inválidos");
  ok(true, "código de configuração errado é recusado");
  await fill(TOKEN, "52998224725");
  await p.waitForSelector("text=CPF ou código de configuração inválidos");
  ok(true, "outro CPF (mesmo com código certo) é recusado");
  ok((await p.inputValue("input[name=name]")) === "Administrador Principal", "após erro, os campos digitados são mantidos");
  await p.screenshot({ path: "tests/e2e/screenshots/pa-form.png" });
  await fill(TOKEN, ADMIN_CPF);
  await p.waitForURL(/ok=bootstrap/);
  ok(await p.isVisible("text=Administrador criado"), "administrador criado com o CPF autorizado");
  ok(!(await p.isVisible("text=Fazer o primeiro acesso")), "aviso de primeiro acesso some do login");
  await p.goto(B + "/primeiro-acesso");
  ok(await p.isVisible("text=já foi concluída"), "tela de primeiro acesso fica fechada");
  await p.goto(B + "/login"); await p.fill("#cpf", ADMIN_CPF); await p.fill("#password", "Riale#Admin2026");
  await Promise.all([p.waitForURL(/dashboard/), p.click("button[type=submit]")]);
  const fut = p.locator("aside button:has-text('Próximas fases')"); if (await fut.count()) await fut.click();
  const labels = await p.$$eval("aside nav a", (a) => a.map((x) => x.querySelector("span.flex-1")?.textContent?.trim()));
  const required = ["Dashboard", "Vagas", "Candidatos", "Entrevistas", "Admissões", "Colaboradores", "Remuneração", "Pesquisa salarial", "Cargos e carreira", "Relatórios", "Configurações"];
  ok(required.every((r) => labels.includes(r)), "login com o CPF autorizado → dashboard com os 11 módulos no menu");
  await p.screenshot({ path: "tests/e2e/screenshots/pa-dashboard.png" });
  // cadastra gestor + usuário gestor + usuário RH
  await p.goto(B + "/configuracoes/gestores");
  await p.fill("input[name=name]", "Gestora Recepção"); await p.fill("input[name=email]", "gestora.recepcao@rialehoteis.com.br");
  await p.fill("input[name=internalId]", "BR-0500");
  await p.selectOption("select[name=positionId]", { label: "Supervisor de Recepção (N5)" });
  await p.selectOption("select[name=departmentId]", { label: "Brisa Barra › Recepção" });
  await p.click("button:has-text('Cadastrar gestor')"); await p.waitForSelector("text=Gestor cadastrado.");
  ok(true, "cadastro de gestor");
  await p.goto(B + "/configuracoes/usuarios");
  await p.fill("input[name=name]", "Analista de RH"); await p.fill("input[name=email]", "analista.rh@rialehoteis.com.br");
  await p.fill("#cpf", "11144477735"); await p.selectOption("select[name=role]", "RH");
  await p.fill("input[name=password]", "Temporaria2026"); await p.click("button:has-text('Cadastrar usuário')");
  await p.waitForSelector("text=Usuário cadastrado"); ok(true, "cadastro de usuário RH");
  await p.fill("input[name=name]", "Gestora Recepção"); await p.fill("input[name=email]", "gestora.recepcao@rialehoteis.com.br");
  await p.fill("#cpf", "16899535009"); await p.selectOption("select[name=role]", "GESTOR");
  await p.selectOption("select[name=managerId]", { label: "Gestora Recepção — Brisa Barra › Recepção" });
  await p.fill("input[name=password]", "Temporaria2026"); await p.click("button:has-text('Cadastrar usuário')");
  await p.waitForSelector("text=Usuário cadastrado"); ok(true, "cadastro de usuário Gestor vinculado ao gestor");
  await p.screenshot({ path: "tests/e2e/screenshots/pa-usuarios.png" });
  const p2 = await (await b.newContext()).newPage();
  await p2.goto(B + "/login"); await p2.fill("#cpf", "11144477735"); await p2.fill("#password", "Temporaria2026");
  await Promise.all([p2.waitForLoadState("networkidle"), p2.click("button[type=submit]")]);
  ok(p2.url().endsWith("/trocar-senha"), "novo usuário RH é obrigado a trocar a senha no 1º acesso");
  await b.close();
})().catch(e => { console.error("  ✗", e.message.split("\n")[0]); process.exit(1); });
