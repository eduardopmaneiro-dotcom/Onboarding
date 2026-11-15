/**
 * Teste ponta a ponta (navegador real) contra o servidor em execução.
 * Pré-requisitos: banco com seed + `npm run build && npm start` (ou `npm run dev`).
 * Uso: BASE_URL=http://localhost:3000 npm run test:e2e
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASS = "Riale@2026Seguro";
const SHOTS = process.env.SHOTS_DIR ?? "tests/e2e/screenshots";
const USERS = {
  admin: "52998224725",
  rh: "11144477735",
  rhBrisa: "39053344705",
  gestor: "16899535009",
};
mkdirSync(SHOTS, { recursive: true });
// Playwright não é dependência do app: usa a instalação local ou global (npm i -D playwright).
const { chromium } = createRequire(import.meta.url)("playwright");

let failures = 0;
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    results.push(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

function psql(sql) {
  const url = (process.env.DATABASE_URL ?? "postgresql://riale:riale_dev@localhost:5432/riale_rh").split("?")[0];
  return execFileSync("psql", [url, "-At", "-c", sql], { encoding: "utf8" }).trim();
}

async function login(page, cpf, password = PASS) {
  await page.goto(`${BASE}/login`);
  await page.fill("#cpf", cpf);
  await page.fill("#password", password);
  await Promise.all([page.waitForLoadState("networkidle"), page.click("button[type=submit]")]);
}

async function sidebarLabels(page) {
  return page.$$eval("aside nav a", (as) => as.map((a) => a.querySelector("span.flex-1")?.textContent?.trim()));
}

const browser = await chromium.launch();
const ctx = () => browser.newContext({ viewport: { width: 1440, height: 900 } });
const run = Date.now().toString(36);

// ── Autenticação ──
await step("sem sessão → redireciona para /login", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/configuracoes`);
  assert(p.url().endsWith("/login"), p.url());
  await p.screenshot({ path: `${SHOTS}/01-login.png` });
  await c.close();
});

await step("senha incorreta → mensagem genérica, sem sessão", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.admin, "SenhaErrada123");
  assert(p.url().includes("error=invalid"), p.url());
  assert(await p.isVisible("text=CPF ou senha inválidos"), "mensagem ausente");
  await c.close();
});

await step("CPF sem senha não autentica (inclusive administrador)", async () => {
  const r = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await r.json();
  const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({ csrfToken, cpf: USERS.admin, password: "" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert(!setCookie.includes("session-token"), "sessão criada sem senha!");
});

// ── Perfil ADMIN ──
await step("ADMIN: login, menu com 11 itens e todas as configurações", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.admin);
  assert(p.url().endsWith("/dashboard"), p.url());
  const labels = await sidebarLabels(p);
  assert(labels.length === 11, `menu: ${labels.join(", ")}`);
  assert(labels[0] === "Dashboard" && labels[10] === "Configurações", labels.join(","));
  await p.screenshot({ path: `${SHOTS}/02-dashboard-admin.png`, fullPage: true });
  await p.goto(`${BASE}/configuracoes`);
  assert((await p.$$("main a.card")).length === 8, "seções de configuração");
  await p.goto(`${BASE}/configuracoes/permissoes`);
  assert(await p.isVisible("text=Matriz de permissões"), "permissões");
  await p.screenshot({ path: `${SHOTS}/03-permissoes.png`, fullPage: true });
  await c.close();
});

await step("ADMIN: cadastra unidade, departamento, cargo e gestor pela interface", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.admin);
  const code = `E2E_${run}`.toUpperCase().slice(0, 20);
  await p.goto(`${BASE}/configuracoes/unidades`);
  await p.fill("input[name=name]", `Copacabana ${run}`);
  await p.fill("input[name=code]", code);
  await p.click("button:has-text('Cadastrar unidade')");
  await p.waitForSelector("text=Unidade cadastrada.");
  await p.waitForSelector(`td:has-text("Copacabana ${run}")`);

  await p.goto(`${BASE}/configuracoes/departamentos`);
  await p.selectOption("select[name=unitId]", { label: `Copacabana ${run}` });
  await p.fill("input[name=name]", "Recepção");
  await p.click("button:has-text('Cadastrar departamento')");
  await p.waitForSelector("text=Departamento cadastrado.");

  await p.goto(`${BASE}/cargos`);
  await p.fill("input[name=title]", `Concierge ${run}`);
  await p.selectOption("select[name=level]", "N3");
  await p.click("button:has-text('Cadastrar cargo')");
  await p.waitForSelector("text=Cargo cadastrado.");

  await p.goto(`${BASE}/configuracoes/gestores`);
  await p.fill("input[name=name]", `Gestora E2E ${run}`);
  await p.fill("input[name=email]", `gestora.${run}@rialehoteis.com.br`);
  await p.fill("input[name=internalId]", `CP-${run}`);
  await p.selectOption("select[name=positionId]", { label: "Supervisor de Recepção (N5)" });
  await p.selectOption("select[name=departmentId]", { label: `Copacabana ${run} › Recepção` });
  await p.selectOption("select[name=directSuperiorId]", { index: 1 });
  await p.click("button:has-text('Cadastrar gestor')");
  await p.waitForSelector("text=Gestor cadastrado.");
  // segundo gestor no mesmo departamento
  await p.fill("input[name=name]", `Gestor Dois ${run}`);
  await p.fill("input[name=email]", `gestor2.${run}@rialehoteis.com.br`);
  await p.fill("input[name=internalId]", `CP2-${run}`);
  await p.selectOption("select[name=positionId]", { label: "Supervisor de Recepção (N5)" });
  await p.selectOption("select[name=departmentId]", { label: `Copacabana ${run} › Recepção` });
  await p.click("button:has-text('Cadastrar gestor')");
  await p.waitForSelector("text=Gestor cadastrado.");
  const n = psql(`SELECT count(*) FROM "Manager" m JOIN "Department" d ON d.id=m."departmentId" JOIN "Unit" u ON u.id=d."unitId" WHERE u.code='${code}'`);
  assert(n === "2", `gestores no depto: ${n}`);
  await p.screenshot({ path: `${SHOTS}/04-gestores.png`, fullPage: true });
  await c.close();
});

await step("ADMIN: validação de formulário (CPF inválido e sem identificação)", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.admin);
  await p.goto(`${BASE}/configuracoes/gestores`);
  await p.fill("input[name=name]", "Teste Inválido");
  await p.fill("input[name=email]", "nao-e-email");
  await p.fill("#cpf", "11111111111");
  await p.click("button:has-text('Cadastrar gestor')");
  await p.waitForSelector("text=Dados inválidos");
  assert(await p.isVisible("text=CPF inválido"), "erro de CPF");
  assert(await p.isVisible("text=E-mail inválido"), "erro de e-mail");
  await c.close();
});

await step("ADMIN: revelar CPF gera registro PII_ACCESS na auditoria", async () => {
  const before = Number(psql(`SELECT count(*) FROM "AuditLog" WHERE action='PII_ACCESS'`));
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.admin);
  await p.goto(`${BASE}/configuracoes/usuarios`);
  assert(await p.isVisible("text=***.982.247-**"), "CPF mascarado");
  await p.click("tr:has-text('Administrador do Sistema') button:has-text('revelar')");
  await p.waitForSelector("text=529.982.247-25");
  const after = Number(psql(`SELECT count(*) FROM "AuditLog" WHERE action='PII_ACCESS'`));
  assert(after === before + 1, `${before} → ${after}`);
  await c.close();
});

await step("ADMIN: cria usuário RH; 1º acesso força troca de senha", async () => {
  const cpf = (() => {
    const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    for (const len of [9, 10]) {
      let s = 0;
      for (let i = 0; i < len; i++) s += d[i] * (len + 1 - i);
      const r = (s * 10) % 11;
      d.push(r === 10 ? 0 : r);
    }
    return d.join("");
  })();
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.admin);
  await p.goto(`${BASE}/configuracoes/usuarios`);
  await p.fill("input[name=name]", `Analista RH ${run}`);
  await p.fill("input[name=email]", `analista.${run}@rialehoteis.com.br`);
  await p.fill("#cpf", cpf);
  await p.selectOption("select[name=role]", "RH");
  await p.selectOption("select[name=unitId]", { label: "Imperial" });
  await p.fill("input[name=password]", "Temporaria2026");
  await p.click("button:has-text('Cadastrar usuário')");
  await p.waitForSelector("text=Usuário cadastrado");
  await c.close();

  const c2 = await ctx();
  const p2 = await c2.newPage();
  await login(p2, cpf, "Temporaria2026");
  assert(p2.url().endsWith("/trocar-senha"), p2.url());
  await p2.goto(`${BASE}/dashboard`);
  assert(p2.url().endsWith("/trocar-senha"), "deveria bloquear o acesso até trocar");
  await p2.fill("input[name=current]", "Temporaria2026");
  await p2.fill("input[name=password]", "NovaSenha2026x");
  await p2.fill("input[name=confirm]", "NovaSenha2026x");
  await Promise.all([p2.waitForURL(/\/login\?ok=changed/), p2.click("button:has-text('Salvar nova senha')")]);
  await login(p2, cpf, "NovaSenha2026x");
  assert(p2.url().endsWith("/dashboard"), p2.url());
  assert(await p2.isVisible("aside >> text=Imperial"), "escopo da unidade");
  await c2.close();
});

// ── Perfil RH ──
await step("RH de unidade: vê configurações, mas não permissões/sistema; escopo restrito", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.rhBrisa);
  const labels = await sidebarLabels(p);
  assert(labels.includes("Configurações") && labels.length === 11, labels.join(","));
  await p.goto(`${BASE}/configuracoes/permissoes`);
  assert(p.url().endsWith("/acesso-negado"), p.url());
  await p.goto(`${BASE}/configuracoes/sistema`);
  assert(p.url().endsWith("/acesso-negado"), p.url());
  await p.goto(`${BASE}/configuracoes/departamentos`);
  const units = await p.$$eval("tbody tr td:nth-child(2)", (tds) => [...new Set(tds.map((t) => t.textContent))]);
  assert(units.length === 1 && units[0] === "Brisa Barra", units.join(","));
  await p.goto(`${BASE}/configuracoes/usuarios`);
  const roles = await p.$$eval("select[name=role] option", (os) => os.map((o) => o.value));
  assert(roles.join() === "GESTOR", `RH só concede Gestor: ${roles}`);
  await c.close();
});

// ── Perfil GESTOR ──
await step("GESTOR: menu sem Configurações/Remuneração; áreas restritas negadas; módulo futuro sinalizado", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.gestor);
  const labels = await sidebarLabels(p);
  for (const hidden of ["Configurações", "Remuneração", "Pesquisa salarial", "Candidatos", "Admissões"]) assert(!labels.includes(hidden), `${hidden} visível`);
  assert(labels.includes("Vagas") && labels.includes("Cargos e carreira"), labels.join(","));
  await p.goto(`${BASE}/configuracoes/usuarios`);
  assert(p.url().endsWith("/acesso-negado"), p.url());
  await p.goto(`${BASE}/remuneracao`);
  assert(p.url().endsWith("/acesso-negado"), p.url());
  await p.goto(`${BASE}/vagas`);
  assert(await p.isVisible("text=Módulo em desenvolvimento"), "placeholder");
  await p.screenshot({ path: `${SHOTS}/05-modulo-futuro-gestor.png` });
  const me = await p.evaluate(() => fetch("/api/v1/me").then((r) => r.json()));
  assert(me.data.role === "GESTOR", JSON.stringify(me));
  const users = await p.evaluate(() => fetch("/api/v1/users").then((r) => r.status));
  assert(users === 403, `API users → ${users}`);
  const create = await p.evaluate(() => fetch("/api/v1/units", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Hack", code: "HACK" }) }).then((r) => r.status));
  assert(create === 403, `API POST units → ${create}`);
  await c.close();
});

// ── API ──
await step("API v1: RH corporativo lista e cria via JSON, com validação", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.rh);
  const list = await p.evaluate(() => fetch("/api/v1/units").then((r) => r.json()));
  assert(list.data.length >= 3, "unidades");
  const bad = await p.evaluate(() => fetch("/api/v1/departments", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.status));
  assert(bad === 422, `validação → ${bad}`);
  const managers = await p.evaluate(() => fetch("/api/v1/managers").then((r) => r.json()));
  assert(managers.data.every((m) => !("cpfEnc" in m) && !("cpfHash" in m)), "API vazou CPF");
  await c.close();
});

await step("Documentos: upload cifrado em disco e download íntegro com auditoria", async () => {
  const c = await ctx();
  const p = await c.newPage();
  await login(p, USERS.rh);
  const res = await p.evaluate(async () => {
    const fd = new FormData();
    fd.append("file", new File(["%PDF-1.4\n% teste riale\n"], "contrato.pdf", { type: "application/pdf" }));
    fd.append("ownerType", "Manager");
    fd.append("ownerId", "teste");
    fd.append("category", "contrato");
    const up = await fetch("/api/v1/documents", { method: "POST", body: fd }).then((r) => r.json());
    const down = await fetch(`/api/v1/documents/${up.data.id}`).then((r) => r.text());
    const exe = new FormData();
    exe.append("file", new File(["MZ\x90\x00"], "virus.pdf"));
    exe.append("ownerType", "Manager");
    exe.append("ownerId", "teste");
    const blocked = await fetch("/api/v1/documents", { method: "POST", body: exe }).then((r) => r.status);
    return { id: up.data.id, down, blocked };
  });
  assert(res.down.startsWith("%PDF-1.4"), "conteúdo");
  assert(res.blocked === 422, `arquivo falso aceito: ${res.blocked}`);
  const key = psql(`SELECT "storageKey" FROM "Document" WHERE id='${res.id}'`);
  const onDisk = execFileSync("head", ["-c", "64", `${process.env.DOCUMENTS_DIR ?? "storage/documents"}/${key}`]).toString("latin1");
  assert(!onDisk.includes("%PDF"), "arquivo em claro no disco!");
  assert(psql(`SELECT count(*) FROM "AuditLog" WHERE "entityId"='${res.id}' AND action='DOCUMENT_DOWNLOAD'`) === "1", "auditoria do download");
  await c.close();
});

// ── Recuperação de senha ──
await step("Recuperação: link por token redefine a senha; token é de uso único", async () => {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const uid = psql(`SELECT id FROM "User" WHERE email='rh@rialehoteis.com.br'`);
  psql(`INSERT INTO "PasswordResetToken"(id,"userId","tokenHash","expiresAt") VALUES ('e2e${run}','${uid}','${hash}', now() + interval '30 minutes')`);
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/recuperar-senha`);
  await p.fill("#cpf", USERS.rh);
  await p.fill("input[name=email]", "rh@rialehoteis.com.br");
  await p.click("button:has-text('Enviar link')");
  await p.waitForSelector("text=Se os dados conferirem");
  // o pedido acima invalida tokens anteriores — gera um novo para o teste
  psql(`INSERT INTO "PasswordResetToken"(id,"userId","tokenHash","expiresAt") VALUES ('e2f${run}','${uid}','${createHash("sha256").update(token + "2").digest("hex")}', now() + interval '30 minutes')`);
  await p.goto(`${BASE}/redefinir-senha?token=${token}2`);
  await p.fill("input[name=password]", PASS);
  await p.fill("input[name=confirm]", PASS);
  await Promise.all([p.waitForURL(/ok=reset/), p.click("button:has-text('Redefinir senha')")]);
  await p.goto(`${BASE}/redefinir-senha?token=${token}2`);
  await p.fill("input[name=password]", PASS);
  await p.fill("input[name=confirm]", PASS);
  await p.click("button:has-text('Redefinir senha')");
  await p.waitForSelector("text=Link inválido ou expirado");
  await login(p, USERS.rh);
  assert(p.url().endsWith("/dashboard"), p.url());
  await c.close();
});

await step("Bloqueio após 5 tentativas erradas", async () => {
  const cpf = USERS.rhBrisa;
  const c = await ctx();
  const p = await c.newPage();
  for (let i = 0; i < 5; i++) await login(p, cpf, "Errada" + i + "Xx1");
  assert(p.url().includes("error=locked"), p.url());
  await login(p, cpf, PASS); // senha certa, mas bloqueado
  assert(p.url().includes("error=locked"), "deveria continuar bloqueado");
  psql(`UPDATE "User" SET "lockedUntil"=NULL, "failedLoginCount"=0 WHERE "cpfHash" IS NOT NULL AND email='rh.brisabarra@rialehoteis.com.br'`);
  await c.close();
});

await step("Responsivo: menu lateral vira gaveta no celular", async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await login(p, USERS.admin);
  await p.screenshot({ path: `${SHOTS}/06-mobile-dashboard.png` });
  await p.click("button[aria-label='Abrir menu']");
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SHOTS}/07-mobile-menu.png` });
  assert(await p.isVisible("aside >> text=Pesquisa salarial"), "menu aberto");
  await c.close();
});

await browser.close();
console.log(results.join("\n"));
console.log(failures ? `\n${failures} falha(s)` : "\nTodos os cenários passaram.");
process.exit(failures ? 1 : 0);
