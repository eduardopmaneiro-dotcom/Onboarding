/**
 * Comunicação consolidada com gestores (Fase 3).
 *
 * AGENDA     — um aviso por gestor e data. Agendamentos feitos juntos (ou dentro da janela
 *              de espera) viram UMA mensagem. Mudanças posteriores geram uma ATUALIZAÇÃO
 *              (nova versão) com a agenda completa e o que mudou. Conteúdo idêntico ao último
 *              envio é descartado (sem e-mail repetido).
 * FECHAMENTO — no horário configurado (18h30) ou quando o RH encerra o dia: resultados por
 *              gestor. Sem resultado registrado = "pendente" (nunca inferido). Mudança depois
 *              do fechamento → o RH pode emitir uma RETIFICAÇÃO.
 *
 * Controle de envio: (tipo, gestor, data, versão) único + hash do conteúdo.
 */
import type { InterviewResult, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/crypto";
import { addDays, dateKey, localToDate, timeKey, todayKey, TZ } from "@/lib/datetime";
import { ValidationError } from "@/modules/shared/errors";
import { getSetting } from "@/modules/settings/service";
import { deliver, enqueueEmail, processOutbox } from "@/modules/email/outbox";
import { appUrl } from "@/modules/notifications/service";

// ═════════════════════════ Utilidades ═════════════════════════

export function weekdayLong(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" }).format(localToDate(date, "12:00"));
}
export function dateBR(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}
function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
const SIGNATURE = "Atenciosamente,\nRecursos Humanos — Riale Hotéis.";

async function ccList(): Promise<string[]> {
  const v = await getSetting("email.copia");
  return v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : [];
}

/** Gestor responsável pela vaga: o definido na vaga ou, na falta, o único gestor ativo do departamento. */
type JobForManager = { requestingManagerId: string | null; department: { managers: Array<{ id: string }> } };
export function managerOfJob(job: JobForManager): string | null {
  return job.requestingManagerId ?? (job.department.managers.length === 1 ? job.department.managers[0].id : null);
}

const INTERVIEW_INCLUDE = {
  reason: true,
  application: {
    include: {
      candidate: { select: { fullName: true } },
      jobOpening: { include: { position: { select: { title: true } }, department: { include: { unit: { select: { name: true } }, managers: { where: { active: true }, select: { id: true } } } } } },
    },
  },
} satisfies Prisma.InterviewInclude;

type IV = Prisma.InterviewGetPayload<{ include: typeof INTERVIEW_INCLUDE }>;

/** Entrevistas do dia (não canceladas, fora as históricas importadas), por gestor. */
async function interviewsOfDay(date: string): Promise<{ byManager: Map<string, IV[]>; withoutManager: IV[] }> {
  const list = await prisma.interview.findMany({
    where: { scheduledAt: { gte: localToDate(date), lt: localToDate(addDays(date, 1)) }, status: { not: "CANCELADA" }, application: { jobOpening: { isHistorical: false } } },
    include: INTERVIEW_INCLUDE,
    orderBy: { scheduledAt: "asc" },
  });
  const byManager = new Map<string, IV[]>();
  const withoutManager: IV[] = [];
  for (const iv of list) {
    const m = managerOfJob(iv.application.jobOpening);
    if (!m) withoutManager.push(iv);
    else byManager.set(m, [...(byManager.get(m) ?? []), iv]);
  }
  return { byManager, withoutManager };
}

// ═════════════════════════ AGENDA ═════════════════════════

type AgendaItem = { id: string; time: string; candidate: string; jobId: string; job: string; unit: string; code: string };

function agendaItems(list: IV[]): AgendaItem[] {
  return list.map((iv) => ({
    id: iv.id,
    time: iv.hasTime ? timeKey(iv.scheduledAt) : "--:--",
    candidate: iv.application.candidate.fullName,
    jobId: iv.application.jobOpeningId,
    job: iv.application.jobOpening.position.title,
    unit: iv.application.jobOpening.department.unit.name,
    code: iv.application.jobOpening.code,
  }));
}
const agendaHash = (items: AgendaItem[]) => sha256(JSON.stringify(items.map((i) => [i.id, i.time, i.candidate, i.jobId])));

function groupByJob<T extends { jobId: string; job: string; unit: string; code: string }>(items: T[]) {
  const map = new Map<string, { title: string; items: T[] }>();
  for (const i of items) {
    const g = map.get(i.jobId) ?? { title: `${i.job} — ${i.unit} (${i.code})`, items: [] };
    g.items.push(i);
    map.set(i.jobId, g);
  }
  return [...map.values()];
}

export function buildAgendaText(managerName: string, date: string, items: AgendaItem[], previous: AgendaItem[] | null, now = new Date()) {
  const when = `${weekdayLong(date)}, ${dateBR(date)}`;
  const lines: string[] = [`${greeting(now)}, prezado(a) ${managerName}.`, ""];
  const removed = previous ? previous.filter((p) => !items.some((i) => i.id === p.id)) : [];
  if (!previous) {
    lines.push(`Informamos que foram agendadas as seguintes entrevistas para ${when}:`);
  } else if (items.length === 0) {
    lines.push(`Informamos que as entrevistas de ${when} foram canceladas.`);
  } else {
    lines.push(`Informamos que a agenda de entrevistas de ${when} foi atualizada. Segue a agenda completa:`);
  }
  for (const g of groupByJob(items)) {
    lines.push("", g.title);
    for (const i of g.items) {
      const before = previous?.find((p) => p.id === i.id);
      const tag = previous ? (!before ? " (novo)" : before.time !== i.time ? ` (horário alterado; antes ${before.time})` : "") : "";
      lines.push(`  ${i.time} — ${i.candidate}${tag}`);
    }
  }
  if (removed.length) {
    lines.push("", "Entrevistas canceladas ou retiradas desta data:");
    for (const r of removed) lines.push(`  ${r.time} — ${r.candidate} (${r.job})`);
  }
  lines.push("", SIGNATURE);
  const subject = previous ? `Atualização da agenda de entrevistas — ${when}` : `Entrevistas agendadas — ${when}`;
  return { subject, text: lines.join("\n") };
}

/** Registra (ou estende) o aviso pendente de cada gestor/data afetado por uma mudança na agenda. */
export async function queueAgenda(pairs: Array<{ managerId: string; date: string }>, opts: { hold?: boolean; actorId?: string } = {}) {
  const wait = Number(await getSetting("email.agenda_espera_min"));
  const when = new Date(Date.now() + wait * 60_000);
  const today = todayKey();
  const out: Array<{ digestId: string; managerId: string; date: string; scheduledFor: Date; hold: boolean }> = [];
  const unique = [...new Map(pairs.map((p) => [`${p.managerId}|${p.date}`, p])).values()];
  for (const { managerId, date } of unique) {
    if (date < today) continue; // não avisa sobre datas passadas
    const pending = await prisma.managerDigest.findFirst({ where: { type: "AGENDA", managerId, date, status: { in: ["PENDENTE", "AGUARDANDO_REVISAO"] } }, orderBy: { version: "desc" } });
    if (pending) {
      const hold = pending.hold || !!opts.hold;
      const d = await prisma.managerDigest.update({ where: { id: pending.id }, data: { scheduledFor: when, hold, status: hold ? "AGUARDANDO_REVISAO" : "PENDENTE" } });
      out.push({ digestId: d.id, managerId, date, scheduledFor: when, hold });
      continue;
    }
    const last = await prisma.managerDigest.aggregate({ where: { type: "AGENDA", managerId, date }, _max: { version: true } });
    const d = await prisma.managerDigest.create({
      data: { type: "AGENDA", managerId, date, version: (last._max.version ?? 0) + 1, status: opts.hold ? "AGUARDANDO_REVISAO" : "PENDENTE", hold: !!opts.hold, scheduledFor: when, createdById: opts.actorId },
    });
    out.push({ digestId: d.id, managerId, date, scheduledFor: when, hold: !!opts.hold });
  }
  if (wait === 0) for (const o of out) if (!o.hold) await emitAgenda(o.digestId);
  return out;
}

/** Pares gestor/data afetados por um conjunto de entrevistas (inclui datas antigas, em remarcações). */
export async function pairsForInterviews(ids: string[], extraDates: Array<{ id: string; date: string }> = []) {
  const ivs = await prisma.interview.findMany({ where: { id: { in: ids }, application: { jobOpening: { isHistorical: false } } }, include: { application: { include: { jobOpening: { include: { department: { include: { managers: { where: { active: true }, select: { id: true } } } } } } } } } });
  const pairs: Array<{ managerId: string; date: string }> = [];
  for (const iv of ivs) {
    const m = managerOfJob(iv.application.jobOpening);
    if (!m) continue;
    pairs.push({ managerId: m, date: dateKey(iv.scheduledAt) });
    for (const e of extraDates.filter((x) => x.id === iv.id)) pairs.push({ managerId: m, date: e.date });
  }
  return pairs;
}

/** Texto que seria enviado agora (sem efeitos) — usado na revisão/edição pelo RH. */
export async function previewAgenda(digestId: string) {
  const d = await prisma.managerDigest.findUniqueOrThrow({ where: { id: digestId }, include: { manager: true } });
  const { byManager } = await interviewsOfDay(d.date);
  const items = agendaItems(byManager.get(d.managerId) ?? []);
  const hash = agendaHash(items);
  const last = await prisma.managerDigest.findFirst({ where: { type: "AGENDA", managerId: d.managerId, date: d.date, status: "EMITIDO", version: { lt: d.version } }, orderBy: { version: "desc" } });
  const unchanged = last?.snapshotHash === hash;
  const empty = !last && items.length === 0;
  const built = buildAgendaText(d.manager.name, d.date, items, last ? (last.snapshot as AgendaItem[]) : null);
  const customValid = !!d.customBody && d.customForHash === hash;
  return {
    digest: d, items, hash, unchanged, empty, isUpdate: !!last, generated: built,
    subject: customValid ? d.customSubject || built.subject : built.subject,
    text: customValid ? d.customBody! : built.text,
    customDiscarded: !!d.customBody && !customValid,
  };
}

/** Gera e coloca na fila o aviso de agenda. Descarta quando nada mudou desde o último envio. */
export async function emitAgenda(digestId: string, opts: { force?: boolean } = {}) {
  const allowed = opts.force ? ["PENDENTE", "AGUARDANDO_REVISAO"] : ["PENDENTE"];
  const claimed = await prisma.managerDigest.updateMany({ where: { id: digestId, status: { in: allowed as never } }, data: { status: "EMITIDO", emittedAt: new Date() } });
  if (!claimed.count) return null;
  const p = await previewAgenda(digestId);
  const d = p.digest;
  if (p.unchanged) return discard(d.id, "Sem alterações desde o último aviso — nada foi enviado");
  if (p.empty) return discard(d.id, "Nenhuma entrevista ativa para esta data — nada foi enviado");
  const note = p.customDiscarded ? "O texto editado foi substituído pelo texto padrão porque a agenda mudou depois da edição." : null;
  const n = await prisma.$transaction(async (tx) => {
    await tx.managerDigest.update({ where: { id: d.id }, data: { subject: p.subject, bodyText: p.text, snapshot: p.items as unknown as Prisma.InputJsonValue, snapshotHash: p.hash, note } });
    return enqueueEmail({ tx, to: d.manager.email, cc: await ccList(), subject: p.subject, text: p.text, html: toHtml(p.subject, p.text), template: p.isUpdate ? "gestor.agenda.atualizacao" : "gestor.agenda", relatedEntity: "ManagerDigest", relatedId: d.id, digestId: d.id });
  });
  await deliver(n.id).catch(() => undefined);
  return n;
}

async function discard(id: string, note: string) {
  await prisma.managerDigest.update({ where: { id }, data: { status: "DESCARTADO", note } });
  return null;
}

export async function dispatchDueAgendas() {
  const due = await prisma.managerDigest.findMany({ where: { type: "AGENDA", status: "PENDENTE", hold: false, scheduledFor: { lte: new Date() } }, select: { id: true } });
  let n = 0;
  for (const d of due) if (await emitAgenda(d.id)) n++;
  return n;
}

// ═════════════════════════ FECHAMENTO ═════════════════════════

type ClosingItem = AgendaItem & { result: InterviewResult; reason: string | null; note: string | null };

function closingItems(list: IV[]): ClosingItem[] {
  return agendaItems(list).map((a, i) => {
    const iv = list[i];
    return { ...a, result: iv.result, reason: iv.reason?.label ?? null, note: iv.reason?.requiresNote ? iv.resultNote : null };
  });
}
const closingHash = (items: ClosingItem[]) => sha256(JSON.stringify(items.map((i) => [i.id, i.time, i.result, i.reason, i.note])));

const RESULT_TEXT: Record<InterviewResult, string> = {
  APROVADO: "Aprovado(a) pelo RH — aguarda sua avaliação na plataforma",
  REPROVADO: "Reprovado(a)",
  NAO_COMPARECEU: "Não compareceu",
  DESISTIU: "Desistiu",
  PENDENTE: "Pendente — resultado ainda não registrado pelo RH",
};

export function buildClosingText(managerName: string, date: string, items: ClosingItem[], opts: { rectifies?: Date | null; now?: Date } = {}) {
  const when = `${weekdayLong(date)}, ${dateBR(date)}`;
  const c = (r: InterviewResult) => items.filter((i) => i.result === r).length;
  const interviewed = c("APROVADO") + c("REPROVADO") + c("DESISTIU");
  const lines: string[] = [`${greeting(opts.now)}, prezado(a) ${managerName}.`, ""];
  if (opts.rectifies) lines.push(`Esta mensagem retifica o resumo enviado em ${dateBR(dateKey(opts.rectifies))} às ${timeKey(opts.rectifies)}. Segue a versão atualizada.`, "");
  lines.push(`Segue o resultado das entrevistas de ${when}:`);
  for (const g of groupByJob(items)) {
    lines.push("", g.title);
    for (const i of g.items) {
      const reason = i.reason ? ` — Motivo: ${i.reason}${i.note ? ` (${i.note})` : ""}` : "";
      lines.push(`  ${i.time} — ${i.candidate}: ${RESULT_TEXT[i.result]}${i.result === "REPROVADO" || i.result === "DESISTIU" ? reason : ""}`);
    }
  }
  lines.push(
    "",
    `Resumo: ${items.length} agendada(s) · ${interviewed} entrevistado(s) · ${c("APROVADO")} aprovado(s) · ${c("REPROVADO")} reprovado(s) · ${c("NAO_COMPARECEU")} não compareceu(ram) · ${c("DESISTIU")} desistência(s) · ${c("PENDENTE")} pendente(s).`
  );
  if (c("APROVADO")) lines.push("", `Os candidatos aprovados pelo RH aguardam sua avaliação formal em: ${appUrl()}/aprovacoes`);
  lines.push("Este e-mail é informativo e não substitui a avaliação na plataforma.", "", SIGNATURE);
  const subject = `${opts.rectifies ? "Retificação — " : ""}Resultado das entrevistas — ${when}`;
  return { subject, text: lines.join("\n") };
}

async function emitClosing(managerId: string, date: string, items: ClosingItem[], opts: { rectifies?: Date | null; actorId?: string | null }) {
  const manager = await prisma.manager.findUniqueOrThrow({ where: { id: managerId } });
  const last = await prisma.managerDigest.aggregate({ where: { type: "FECHAMENTO", managerId, date }, _max: { version: true } });
  const { subject, text } = buildClosingText(manager.name, date, items, { rectifies: opts.rectifies });
  const n = await prisma.$transaction(async (tx) => {
    const d = await tx.managerDigest.create({
      data: {
        type: "FECHAMENTO", managerId, date, version: (last._max.version ?? 0) + 1, status: "EMITIDO", isRectification: !!opts.rectifies,
        subject, bodyText: text, snapshot: items as unknown as Prisma.InputJsonValue, snapshotHash: closingHash(items), emittedAt: new Date(), createdById: opts.actorId ?? null,
      },
    });
    return enqueueEmail({ tx, to: manager.email, cc: await ccList(), subject, text, html: toHtml(subject, text), template: opts.rectifies ? "gestor.fechamento.retificacao" : "gestor.fechamento", relatedEntity: "ManagerDigest", relatedId: d.id, digestId: d.id });
  });
  await deliver(n.id).catch(() => undefined);
  return n;
}

/** Encerra a agenda do dia: um relatório por gestor. Manual (RH) ou automático (horário). */
export async function closeDay(date: string, mode: "MANUAL" | "AUTOMATICO", actorId?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError("Data inválida");
  if (mode === "MANUAL" && date > todayKey()) throw new ValidationError("Só é possível encerrar a agenda de hoje ou de dias anteriores");
  const { byManager, withoutManager } = await interviewsOfDay(date);
  const all = [...byManager.values()].flat().concat(withoutManager);
  const pendingCount = all.filter((i) => i.result === "PENDENTE").length;
  try {
    await prisma.dailyClosing.create({
      data: { date, mode, closedById: actorId ?? null, pendingCount, summary: { gestores: byManager.size, entrevistas: all.length, semGestor: withoutManager.map((i) => `${i.application.candidate.fullName} (${i.application.jobOpening.code})`) } },
    });
  } catch {
    if (mode === "AUTOMATICO") return null;
    const c = await prisma.dailyClosing.findUnique({ where: { date } });
    throw new ValidationError(`A agenda de ${dateBR(date)} já foi encerrada${c ? ` às ${timeKey(c.closedAt)}` : ""}. Use “Emitir retificação” se algo mudou.`);
  }
  // avisos de agenda ainda pendentes para o dia encerrado perdem o sentido
  await prisma.managerDigest.updateMany({ where: { type: "AGENDA", date, status: { in: ["PENDENTE", "AGUARDANDO_REVISAO"] } }, data: { status: "DESCARTADO", note: "Dia encerrado antes do envio do aviso" } });
  let sent = 0;
  for (const [managerId, list] of byManager) {
    await emitClosing(managerId, date, closingItems(list), { actorId });
    sent++;
  }
  return { date, managers: sent, interviews: all.length, pending: pendingCount, withoutManager: withoutManager.length };
}

/** Dias encerrados cujos resultados mudaram depois do envio (ou ganharam gestor novo). */
export async function rectificationCandidates(days = 14) {
  const from = addDays(todayKey(), -days);
  const closings = await prisma.dailyClosing.findMany({ where: { date: { gte: from } }, orderBy: { date: "desc" } });
  const out: Array<{ managerId: string; managerName: string; date: string; lastEmittedAt: Date | null; changes: number }> = [];
  for (const c of closings) {
    const { byManager } = await interviewsOfDay(c.date);
    const managers = new Set([...byManager.keys()]);
    const sentList = await prisma.managerDigest.findMany({ where: { type: "FECHAMENTO", date: c.date, status: "EMITIDO" }, orderBy: { version: "desc" } });
    for (const s of sentList) managers.add(s.managerId);
    for (const m of managers) {
      const last = sentList.find((s) => s.managerId === m);
      const items = closingItems(byManager.get(m) ?? []);
      if (last && last.snapshotHash === closingHash(items)) continue;
      if (!last && items.length === 0) continue;
      const prev = (last?.snapshot as ClosingItem[] | undefined) ?? [];
      const changes = items.filter((i) => { const p = prev.find((x) => x.id === i.id); return !p || p.result !== i.result || p.reason !== i.reason || p.time !== i.time; }).length + prev.filter((p) => !items.some((i) => i.id === p.id)).length;
      const manager = await prisma.manager.findUnique({ where: { id: m }, select: { name: true } });
      out.push({ managerId: m, managerName: manager?.name ?? "—", date: c.date, lastEmittedAt: last?.emittedAt ?? null, changes });
    }
  }
  return out;
}

export async function emitRectification(managerId: string, date: string, actorId?: string | null) {
  const closing = await prisma.dailyClosing.findUnique({ where: { date } });
  if (!closing) throw new ValidationError("O dia ainda não foi encerrado — o fechamento normal incluirá as alterações");
  const { byManager } = await interviewsOfDay(date);
  const items = closingItems(byManager.get(managerId) ?? []);
  const last = await prisma.managerDigest.findFirst({ where: { type: "FECHAMENTO", managerId, date, status: "EMITIDO" }, orderBy: { version: "desc" } });
  if (last && last.snapshotHash === closingHash(items)) throw new ValidationError("Nada mudou desde o último envio — retificação não é necessária");
  return emitClosing(managerId, date, items, { rectifies: last?.emittedAt ?? closing.closedAt, actorId });
}

// ═════════════════════════ ROTINA PERIÓDICA ═════════════════════════

async function acquireLock(name: string, seconds: number): Promise<boolean> {
  await prisma.systemLock.upsert({ where: { name }, update: {}, create: { name, lockedUntil: new Date(0) } });
  const r = await prisma.systemLock.updateMany({ where: { name, lockedUntil: { lt: new Date() } }, data: { lockedUntil: new Date(Date.now() + seconds * 1000) } });
  return r.count === 1;
}
async function releaseLock(name: string) {
  await prisma.systemLock.update({ where: { name }, data: { lockedUntil: new Date(0) } }).catch(() => undefined);
}

/** Dias a encerrar automaticamente: desde a ativação (no máximo 3 dias para trás) até hoje. */
export async function autoCloseDays(now = new Date()) {
  if (!(await getSetting("email.fechamento_automatico"))) return [];
  const today = dateKey(now);
  let since = (await prisma.setting.findUnique({ where: { key: "email.ativo_desde" } }))?.value as string | undefined;
  if (!since) {
    since = today;
    await prisma.setting.create({ data: { key: "email.ativo_desde", value: today, description: "Início da comunicação automática (não fecha dias anteriores)" } }).catch(() => undefined);
  }
  const closingTime = String(await getSetting("email.fechamento_horario"));
  const nowTime = timeKey(now);
  const results = [];
  for (let d = [since, addDays(today, -3)].sort().pop()!; d <= today; d = addDays(d, 1)) {
    if (d === today && nowTime < closingTime) break;
    if (await prisma.dailyClosing.findUnique({ where: { date: d } })) continue;
    const { byManager, withoutManager } = await interviewsOfDay(d);
    if (!byManager.size && !withoutManager.length) continue;
    const r = await closeDay(d, "AUTOMATICO", null);
    if (r) results.push(r);
  }
  return results;
}

/** Executada pelo cron e, enquanto o RH usa a plataforma, a cada minuto. Idempotente. */
export async function runTick() {
  if (!(await acquireLock("tick", 120))) return { skipped: true };
  try {
    const agendas = await dispatchDueAgendas();
    const closings = await autoCloseDays();
    const probation = await import("@/modules/people/alerts").then((m) => m.probationAlerts()).catch((e) => { console.error("alertas da experiência", e); return null; });
    const outbox = await processOutbox();
    return { skipped: false, agendas, closings: closings.length, probation, outbox };
  } finally {
    await releaseLock("tick");
  }
}

// ═════════════════════════ HTML (identidade visual dos documentos de RH) ═════════════════════════

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Mesmo conteúdo do texto, com a paleta dos documentos de RH (marrom #5C3D1E, dourado #8B6340, bege #F5EFE6). */
export function toHtml(subject: string, text: string): string {
  const body = text
    .split("\n")
    .map((l) => {
      if (!l.trim()) return '<div style="height:10px"></div>';
      if (/^\s{2}/.test(l)) return `<div style="padding:2px 0 2px 14px;font-family:Arial,sans-serif;font-size:14px;color:#2b2118">${esc(l.trim())}</div>`;
      const link = l.match(/(https?:\/\/\S+)/);
      const html = link ? esc(l).replace(esc(link[1]), `<a href="${esc(link[1])}" style="color:#8B6340">${esc(link[1])}</a>`) : esc(l);
      const bold = / \([A-Z]{3}-\d{4}-\d{4}\)$/.test(l) ? "font-weight:bold;color:#5C3D1E;margin-top:4px" : "";
      return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#2b2118;${bold}">${html}</div>`;
    })
    .join("");
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F5EFE6;padding:24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e6d9c6">
<tr><td style="background:#5C3D1E;padding:14px 20px;font-family:Georgia,serif;color:#F5EFE6;font-size:16px;letter-spacing:1px">RIALE HOTÉIS · RECURSOS HUMANOS</td></tr>
<tr><td style="padding:20px">${body}</td></tr>
<tr><td style="background:#F5EFE6;padding:10px 20px;font-family:Arial,sans-serif;font-size:11px;color:#8B6340">Mensagem automática da Plataforma de RH · ${esc(subject)} · Uso interno e confidencial.</td></tr>
</table></body></html>`;
}
