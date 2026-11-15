/**
 * Fase 3 — comunicação com gestores. Os e-mails trafegam por SMTP de verdade até um servidor
 * SMTP local de teste (nenhum envio é simulado no código da aplicação).
 * Requer o banco com `npm run db:seed:demo`.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { prisma } from "../../src/lib/prisma";
import { asUser } from "../../prisma/demo-recruitment";
import { addDays, todayKey } from "../../src/lib/datetime";
import { createCandidate } from "../../src/modules/recruitment/candidates";
import { cancelInterview, registerResult, rescheduleInterview, scheduleInterviews } from "../../src/modules/recruitment/workflow";
import { closeDay, dateBR, dispatchDueAgendas, emitRectification, queueAgenda, rectificationCandidates, runTick, weekdayLong } from "../../src/modules/email/digests";
import { deliver, enqueueEmail, processOutbox } from "../../src/modules/email/outbox";
import { toPublicError } from "../../src/modules/shared/errors";

type Mail = { to: string; cc: string; subject: string; text: string; html: string };
const inbox: Mail[] = [];
let reject: string | null = null; // simula indisponibilidade do servidor de e-mail
let server: SMTPServer;
const TAG = Date.now().toString(36).toUpperCase();
/** Como o nome fica gravado (o cadastro padroniza maiúsculas/minúsculas) */
const NT = TAG.charAt(0) + TAG.slice(1).toLowerCase();

before(async () => {
  server = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    onAuth: (_a, _s, cb) => cb(null, { user: "riale" }),
    onData(stream, _session, cb) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", async () => {
        if (reject) {
          const err = new Error(reject) as Error & { responseCode: number };
          err.responseCode = 451;
          return cb(err);
        }
        const m = await simpleParser(Buffer.concat(chunks));
        const addr = (a: unknown) => (Array.isArray(a) ? a : a ? [a] : []).map((x: { text: string }) => x.text).join(", ");
        inbox.push({ to: addr(m.to), cc: addr(m.cc), subject: m.subject ?? "", text: m.text ?? "", html: typeof m.html === "string" ? m.html : "" });
        cb();
      });
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.server.address() as { port: number }).port;
  Object.assign(process.env, {
    EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_SECURE: "false",
    SMTP_USER: "rh@rialehoteis.com.br", SMTP_PASSWORD: "teste", EMAIL_FROM: "Recursos Humanos — Riale Hotéis <rh@rialehoteis.com.br>",
  });
  // janela de consolidação de 3 min (padrão) e comunicação ativa desde ontem
  await prisma.setting.upsert({ where: { key: "email.agenda_espera_min" }, update: { value: 3 }, create: { key: "email.agenda_espera_min", value: 3 } });
  await prisma.setting.upsert({ where: { key: "email.ativo_desde" }, update: { value: addDays(todayKey(), -1) }, create: { key: "email.ativo_desde", value: addDays(todayKey(), -1) } });
  await prisma.setting.upsert({ where: { key: "email.fechamento_horario" }, update: { value: "23:59" }, create: { key: "email.fechamento_horario", value: "23:59" } });
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect();
});

const rh = () => asUser(prisma, "rh@rialehoteis.com.br");
const job = (email: string) => prisma.jobOpening.findFirstOrThrow({ where: { requestingManager: { email }, isHistorical: false, status: "ABERTA" }, orderBy: { createdAt: "asc" } });
const MARINA = "marina.souza@rialehoteis.com.br";
const FERNANDA = "fernanda.castro@rialehoteis.com.br";

async function candidates(n: number, jobId: string, label: string) {
  const u = await rh();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { candidate } = await createCandidate(u, { fullName: `${label} ${i + 1} ${TAG}`, phone: `2197${String(Date.now()).slice(-6)}${i}`.slice(0, 11), jobOpeningId: jobId, confirmNew: true });
    ids.push(candidate.id);
  }
  return ids;
}

/** "O tempo passa": vence a janela de consolidação e roda o envio. */
async function flush() {
  await prisma.managerDigest.updateMany({ where: { status: "PENDENTE" }, data: { scheduledFor: new Date(Date.now() - 1000) } });
  await dispatchDueAgendas();
  await processOutbox();
}
const mailsTo = (email: string, date: string) => inbox.filter((m) => m.to.includes(email) && m.subject.includes(dateBR(date)));

const D1 = addDays(todayKey(), 21);
const D2 = addDays(todayKey(), 22);
const D3 = addDays(todayKey(), 23);
let d1Interviews: string[] = [];

test("Dia da semana calculado no fuso de São Paulo", () => {
  const expected = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(new Date(`${D1}T12:00:00-03:00`));
  assert.equal(weekdayLong(D1), expected);
  assert.equal(weekdayLong("2026-11-16"), "segunda-feira");
  assert.equal(weekdayLong("2026-12-01"), "terça-feira");
});

test("Cinco entrevistas para o mesmo gestor → UM e-mail consolidado, no modelo combinado", async () => {
  const j = await job(MARINA);
  const ids = await candidates(5, j.id, "Cinco");
  const created = await scheduleInterviews(await rh(), { jobOpeningId: j.id, candidateIds: ids, date: D1, time: "09:00", durationMin: 30, sequential: true });
  d1Interviews = created.map((c) => c.id);
  assert.equal(created.notices.length, 1, "um aviso programado");
  assert.equal(mailsTo(MARINA, D1).length, 0, "nada sai antes da janela de consolidação");
  await flush();
  const mails = mailsTo(MARINA, D1);
  assert.equal(mails.length, 1, "um único e-mail");
  const m = mails[0];
  assert.equal(m.subject, `Entrevistas agendadas — ${weekdayLong(D1)}, ${dateBR(D1)}`);
  assert.match(m.text, /^(Bom dia|Boa tarde|Boa noite), prezado\(a\) Marina Souza\./);
  assert.ok(m.text.includes(`Informamos que foram agendadas as seguintes entrevistas para ${weekdayLong(D1)}, ${dateBR(D1)}:`));
  assert.ok(m.text.includes(`Recepcionista — Brisa Barra (${j.code})`));
  for (const [i, t] of ["09:00", "09:30", "10:00", "10:30", "11:00"].entries()) assert.ok(m.text.includes(`${t} — Cinco ${i + 1} ${NT}`), t);
  assert.ok(m.text.trim().endsWith("Atenciosamente,\nRecursos Humanos — Riale Hotéis."));
  assert.ok(m.html.includes("#5C3D1E") && m.html.includes("Cinco 1"), "versão HTML com a identidade visual");
});

test("Agendamentos feitos em sequência dentro da janela viram um só aviso", async () => {
  const j = await job(MARINA);
  const u = await rh();
  await scheduleInterviews(u, { jobOpeningId: j.id, candidateIds: await candidates(2, j.id, "Lote A"), date: D2, time: "14:00", sequential: true });
  await scheduleInterviews(u, { jobOpeningId: j.id, candidateIds: await candidates(1, j.id, "Lote B"), date: D2, time: "15:00" });
  await flush();
  const mails = mailsTo(MARINA, D2);
  assert.equal(mails.length, 1);
  assert.ok(mails[0].text.includes("Lote A 1") && mails[0].text.includes("Lote A 2") && mails[0].text.includes("Lote B 1"));
});

test("Gestores diferentes: cada um recebe só as suas vagas", async () => {
  const jm = await job(MARINA);
  const jf = await job(FERNANDA);
  const u = await rh();
  await scheduleInterviews(u, { jobOpeningId: jm.id, candidateIds: await candidates(2, jm.id, "Recep"), date: D3, time: "09:00", sequential: true });
  await scheduleInterviews(u, { jobOpeningId: jf.id, candidateIds: await candidates(2, jf.id, "Salao"), date: D3, time: "09:00", sequential: true });
  await flush();
  const m = mailsTo(MARINA, D3), f = mailsTo(FERNANDA, D3);
  assert.equal(m.length, 1);
  assert.equal(f.length, 1);
  assert.ok(m[0].text.includes("Recep 1") && !m[0].text.includes("Salao") && !m[0].text.includes("Garçom"));
  assert.ok(f[0].text.includes("Salao 1") && f[0].text.includes("Garçom") && !f[0].text.includes("Recep"));
  assert.ok(f[0].text.includes("prezado(a) Fernanda Castro"));
});

test("Alteração de horário → atualização consolidada (versão 2) com o que mudou", async () => {
  await rescheduleInterview(await rh(), d1Interviews[0], D1, "15:00");
  await flush();
  const mails = mailsTo(MARINA, D1);
  assert.equal(mails.length, 2);
  const upd = mails[1];
  assert.equal(upd.subject, `Atualização da agenda de entrevistas — ${weekdayLong(D1)}, ${dateBR(D1)}`);
  assert.ok(upd.text.includes("foi atualizada. Segue a agenda completa:"));
  assert.ok(upd.text.includes(`15:00 — Cinco 1 ${NT} (horário alterado; antes 09:00)`));
  assert.ok(upd.text.includes(`09:30 — Cinco 2 ${NT}`), "agenda completa, não só a mudança");
  const v = await prisma.managerDigest.findFirst({ where: { type: "AGENDA", date: D1, status: "EMITIDO" }, orderBy: { version: "desc" } });
  assert.equal(v?.version, 2);
});

test("Cancelamento → atualização lista a entrevista cancelada", async () => {
  await cancelInterview(await rh(), d1Interviews[1], "candidato pediu");
  await flush();
  const upd = mailsTo(MARINA, D1).at(-1)!;
  assert.equal(mailsTo(MARINA, D1).length, 3);
  assert.ok(upd.text.includes("Entrevistas canceladas ou retiradas desta data:"));
  assert.ok(upd.text.includes(`09:30 — Cinco 2 ${NT}`.replace("09:30", "09:30")));
});

test("Inclusão de novo candidato → atualização marca o novo", async () => {
  const j = await job(MARINA);
  await scheduleInterviews(await rh(), { jobOpeningId: j.id, candidateIds: await candidates(1, j.id, "Novo"), date: D1, time: "16:00" });
  await flush();
  const upd = mailsTo(MARINA, D1).at(-1)!;
  assert.equal(mailsTo(MARINA, D1).length, 4);
  assert.ok(upd.text.includes(`16:00 — Novo 1 ${NT} (novo)`));
});

test("Sem mudança na agenda → nenhum e-mail repetido", async () => {
  const before = inbox.length;
  const marina = await prisma.manager.findUniqueOrThrow({ where: { email: MARINA } });
  await queueAgenda([{ managerId: marina.id, date: D1 }]);
  await flush();
  assert.equal(inbox.length, before);
  const d = await prisma.managerDigest.findFirst({ where: { type: "AGENDA", date: D1, managerId: marina.id }, orderBy: { version: "desc" } });
  assert.equal(d?.status, "DESCARTADO");
  assert.match(d?.note ?? "", /Sem alterações/);
});

test("Fechamento do dia: falta, reprovação com motivo, aprovação, desistência e sem resultado", async () => {
  const today = todayKey();
  const u = await rh();
  const j = await job(MARINA);
  const jf = await job(FERNANDA);
  const ids = await candidates(5, j.id, "Hoje");
  const ivs = await scheduleInterviews(u, { jobOpeningId: j.id, candidateIds: ids, date: today, time: "08:00", sequential: true });
  const fIvs = await scheduleInterviews(u, { jobOpeningId: jf.id, candidateIds: await candidates(1, jf.id, "Garcomhoje"), date: today, time: "08:00" });
  const reason = await prisma.rejectionReason.findUniqueOrThrow({ where: { code: "EXPERIENCIA" } });
  await registerResult(u, ivs[0].id, { result: "APROVADO" });
  await registerResult(u, ivs[1].id, { result: "REPROVADO", reasonId: reason.id });
  await registerResult(u, ivs[2].id, { result: "NAO_COMPARECEU" });
  await registerResult(u, ivs[3].id, { result: "DESISTIU" });
  // ivs[4]: sem resultado
  await registerResult(u, fIvs[0].id, { result: "APROVADO" });
  const approvalMails = await prisma.notification.count({ where: { template: "recrutamento.avaliacao_gestor", createdAt: { gte: new Date(Date.now() - 120_000) } } });
  assert.equal(approvalMails, 0, "aprovação não gera e-mail avulso — vai no fechamento");
  assert.ok(await prisma.managerReview.findFirst({ where: { application: { candidateId: ids[0] }, status: "PENDENTE" } }), "aprovação segue o fluxo formal na plataforma");

  const r = await closeDay(today, "MANUAL", u.id);
  assert.ok(r && r.managers >= 2);
  await processOutbox();
  const m = inbox.filter((x) => x.to.includes(MARINA) && x.subject === `Resultado das entrevistas — ${weekdayLong(today)}, ${dateBR(today)}`);
  assert.equal(m.length, 1);
  const t = m[0].text;
  assert.ok(t.includes(`Hoje 1 ${NT}: Aprovado(a) pelo RH — aguarda sua avaliação na plataforma`));
  assert.ok(t.includes(`Hoje 2 ${NT}: Reprovado(a) — Motivo: Falta de experiência`));
  assert.ok(t.includes(`Hoje 3 ${NT}: Não compareceu`));
  assert.ok(t.includes(`Hoje 4 ${NT}: Desistiu`));
  assert.ok(t.includes(`Hoje 5 ${NT}: Pendente — resultado ainda não registrado pelo RH`), "sem resultado = pendente, nunca inventado");
  assert.match(t, /Resumo: \d+ agendada\(s\) · \d+ entrevistado\(s\)/);
  assert.ok(t.includes("/aprovacoes") && t.includes("não substitui a avaliação"));
  assert.ok(!t.includes("Garcomhoje"), "Fernanda não aparece no e-mail da Marina");
  const f = inbox.filter((x) => x.to.includes(FERNANDA) && x.subject.startsWith("Resultado das entrevistas"));
  assert.equal(f.length, 1);
  assert.ok(f[0].text.includes(`Garcomhoje 1 ${NT}: Aprovado(a)`) && !f[0].text.includes("Hoje 1"));

  // Fechar de novo manualmente é bloqueado; a rotina automática não reenvia
  assert.equal(toPublicError(await closeDay(today, "MANUAL", u.id).catch((e) => e)).status, 422);
  await prisma.setting.update({ where: { key: "email.fechamento_horario" }, data: { value: "00:00" } });
  const before = inbox.length;
  await runTick();
  assert.equal(inbox.filter((x, i) => i >= before && x.subject.startsWith("Resultado das entrevistas") && x.subject.includes(dateBR(today))).length, 0, "relatório não é repetido");
});

test("Alteração depois do fechamento → retificação identificada", async () => {
  const today = todayKey();
  const u = await rh();
  const pending = await prisma.interview.findFirstOrThrow({ where: { application: { candidate: { fullName: `Hoje 5 ${NT}` } } } });
  await registerResult(u, pending.id, { result: "APROVADO" });
  const marina = await prisma.manager.findUniqueOrThrow({ where: { email: MARINA } });
  const cands = await rectificationCandidates();
  assert.ok(cands.some((c) => c.managerId === marina.id && c.date === today && c.changes >= 1));
  await emitRectification(marina.id, today, u.id);
  await processOutbox();
  const rect = inbox.filter((x) => x.to.includes(MARINA) && x.subject.startsWith("Retificação — Resultado das entrevistas"));
  assert.equal(rect.length, 1);
  assert.ok(rect[0].text.includes("Esta mensagem retifica o resumo enviado em"));
  assert.ok(rect[0].text.includes(`Hoje 5 ${NT}: Aprovado(a)`));
  assert.equal(toPublicError(await emitRectification(marina.id, today, u.id).catch((e) => e)).status, 422, "sem nova mudança, sem nova retificação");
});

test("Fechamento automático no horário configurado (dia anterior em aberto)", async () => {
  const y = addDays(todayKey(), -1);
  const u = await rh();
  const j = await job(MARINA);
  const ivs = await scheduleInterviews(u, { jobOpeningId: j.id, candidateIds: await candidates(1, j.id, "Ontem"), date: y, time: "10:00" });
  assert.equal(ivs.notices.length, 0, "data passada não gera aviso de agenda");
  const before = inbox.length;
  await prisma.dailyClosing.deleteMany({ where: { date: y } });
  await runTick();
  const closing = await prisma.dailyClosing.findUnique({ where: { date: y } });
  assert.equal(closing?.mode, "AUTOMATICO");
  const got = inbox.slice(before).filter((x) => x.to.includes(MARINA) && x.subject.includes(dateBR(y)));
  assert.equal(got.length, 1);
  assert.ok(got[0].text.includes(`Ontem 1 ${NT}: Pendente — resultado ainda não registrado pelo RH`));
});

test("Falha no serviço de e-mail → nova tentativa programada, sem perder a mensagem; depois entrega", async () => {
  reject = "4.3.0 Servidor temporariamente indisponível";
  const n = await enqueueEmail({ to: "teste@rialehoteis.com.br", subject: `Teste falha ${TAG}`, text: "x", template: "teste" });
  assert.equal(await deliver(n.id), "PENDENTE");
  let row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
  assert.equal(row.attempts, 1);
  assert.match(row.error ?? "", /451|indisponível/);
  assert.ok(row.nextAttemptAt > new Date(), "próxima tentativa no futuro (backoff)");
  await processOutbox();
  assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status, "PENDENTE", "não tenta antes da hora");

  reject = null;
  await prisma.notification.update({ where: { id: n.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await processOutbox();
  row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
  assert.equal(row.status, "ENVIADA");
  assert.equal(row.attempts, 2);
  assert.ok(inbox.some((m) => m.subject === `Teste falha ${TAG}`));

  // esgota as tentativas → FALHOU (fica visível para reenvio manual)
  reject = "5.0.0 Caixa bloqueada";
  const n2 = await enqueueEmail({ to: "teste@rialehoteis.com.br", subject: `Teste definitivo ${TAG}`, text: "x", template: "teste" });
  await prisma.notification.update({ where: { id: n2.id }, data: { attempts: 5 } });
  assert.equal(await deliver(n2.id), "FALHOU");
  reject = null;
});

test("Sem configuração: nada é dado como enviado — a mensagem aguarda na fila", async () => {
  const saved = { p: process.env.EMAIL_PROVIDER, h: process.env.SMTP_HOST };
  delete process.env.EMAIL_PROVIDER;
  delete process.env.SMTP_HOST;
  const before = inbox.length;
  const n = await enqueueEmail({ to: "teste@rialehoteis.com.br", subject: `Sem config ${TAG}`, text: "x", template: "teste" });
  assert.equal(await deliver(n.id), "PENDENTE");
  const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
  assert.equal(row.attempts, 0, "não consome tentativas");
  assert.match(row.error ?? "", /não configurado/);
  assert.equal(inbox.length, before);
  Object.assign(process.env, { EMAIL_PROVIDER: saved.p, SMTP_HOST: saved.h });
  await prisma.notification.update({ where: { id: n.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await processOutbox();
  assert.ok(inbox.some((m) => m.subject === `Sem config ${TAG}`), "com a configuração, a fila é entregue");
});
