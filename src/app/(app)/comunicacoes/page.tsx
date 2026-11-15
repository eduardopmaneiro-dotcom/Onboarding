import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { addDays, dateKey, fmtDateTime, timeKey, todayKey } from "@/lib/datetime";
import { dayOverview, emailStatus, listDigests, listMessages, pendingRectifications } from "@/modules/email/service";
import { dateBR, weekdayLong } from "@/modules/email/digests";
import { EMAIL_SETUP_GUIDE } from "@/modules/email/config";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { cancelDigestAction, closeDayAction, rectifyAction, retryAction, sendNowAction, testEmailAction } from "./actions";

export const metadata = { title: "Comunicação com gestores" };

const MSG_STATUS: Record<string, { l: string; t: "green" | "gold" | "red" | "gray" | "blue" }> = {
  PENDENTE: { l: "Na fila", t: "gold" }, ENVIANDO: { l: "Enviando", t: "blue" }, ENVIADA: { l: "Enviada", t: "green" }, FALHOU: { l: "Falhou", t: "red" }, LIDA: { l: "Lida", t: "green" }, CANCELADA: { l: "Cancelada", t: "gray" },
};
const DIGEST_STATUS: Record<string, { l: string; t: "green" | "gold" | "red" | "gray" | "blue" }> = {
  PENDENTE: { l: "Aguardando consolidação", t: "gold" }, AGUARDANDO_REVISAO: { l: "Aguardando sua revisão", t: "gold" }, EMITIDO: { l: "Emitido", t: "green" }, DESCARTADO: { l: "Não enviado", t: "gray" }, SEM_DESTINATARIO: { l: "Sem destinatário", t: "red" },
};
const TEMPLATE: Record<string, string> = {
  "gestor.agenda": "Agenda", "gestor.agenda.atualizacao": "Atualização da agenda", "gestor.fechamento": "Fechamento do dia", "gestor.fechamento.retificacao": "Retificação",
  "auth.password_reset": "Redefinição de senha", "recrutamento.nova_entrevista": "Nova entrevista pedida", teste: "Teste",
};

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const user = await requirePermission("comunicacoes.view");
  const sp = await searchParams;
  const date = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : todayKey();
  const manage = can(user, "comunicacoes.manage");
  const cfg = emailStatus();
  const [day, pending, recent, rects, messages] = await Promise.all([
    dayOverview(user, date),
    listDigests(user, { status: ["PENDENTE", "AGUARDANDO_REVISAO", "SEM_DESTINATARIO"] }),
    listDigests(user, { status: ["EMITIDO", "DESCARTADO"], take: 30 }),
    pendingRectifications(user),
    listMessages(user, 30),
  ]);
  const isToday = date === todayKey();

  return (
    <>
      <PageHeader title="Comunicação com gestores" subtitle="Avisos consolidados de agenda, fechamento do dia e histórico dos e-mails. Os e-mails dos gestores vêm da estrutura organizacional." />

      {!cfg.ready && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">O envio de e-mails ainda não está configurado.</p>
          <p className="mt-1">As mensagens estão sendo preparadas e ficam <strong>na fila</strong> — nenhuma é dada como enviada. Falta configurar na Vercel: <strong>{cfg.missing.join(", ")}</strong>. Veja os detalhes em “Configuração” no fim desta página.</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          title={`Fechamento — ${weekdayLong(date)}, ${dateBR(date)}`}
          actions={
            <div className="flex gap-1 text-xs">
              <Link href={`?data=${addDays(date, -1)}`} className="btn-ghost btn-sm">‹</Link>
              {!isToday && <Link href="?" className="btn-ghost btn-sm">Hoje</Link>}
              <Link href={`?data=${addDays(date, 1)}`} className="btn-ghost btn-sm">›</Link>
            </div>
          }
        >
          {day.closing ? (
            <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Agenda encerrada às {timeKey(day.closing.closedAt)} ({day.closing.mode === "MANUAL" ? "pelo RH" : "automaticamente"}) — resultados enviados aos gestores
              {day.closing.pendingCount ? `, com ${day.closing.pendingCount} entrevista(s) informada(s) como pendente(s)` : ""}.
            </p>
          ) : (
            <p className="mb-3 text-sm text-stone-600">
              {day.auto ? <>Fechamento automático às <strong>{day.closingTime}</strong> (Brasília).</> : "Fechamento automático desligado — encerre manualmente."} Entrevistas sem resultado entram como <strong>pendentes</strong>.
            </p>
          )}
          {day.total === 0 ? <Empty>Nenhuma entrevista nesta data.</Empty> : (
            <ul className="divide-y divide-stone-100 text-sm">
              {day.groups.map((g) => (
                <li key={g.manager.id} className="py-2">
                  <div className="flex justify-between"><span className="font-medium text-riale-900">{g.manager.name}</span><span className="text-xs text-stone-500">{g.total} entrevista(s){g.pending.length ? ` · ${g.pending.length} sem resultado` : ""}</span></div>
                  <p className="text-xs text-stone-400">{g.manager.email}</p>
                  {g.pending.map((p) => <p key={p.id} className="mt-1 text-xs text-gold-600">• {timeKey(p.at)} {p.candidate} ({p.job}) — <Link href={`/entrevistas/${p.id}`} className="underline">registrar resultado</Link></p>)}
                </li>
              ))}
              {day.withoutManager.length > 0 && <li className="py-2 text-xs text-red-700">Sem gestor responsável (não recebem e-mail): {day.withoutManager.map((w) => `${w.candidate} (${w.code})`).join(", ")} — defina o gestor na vaga.</li>}
            </ul>
          )}
          {manage && !day.closing && day.total > 0 && date <= todayKey() && (
            <ActionForm action={closeDayAction} className="mt-4 border-t border-stone-100 pt-4">
              <input type="hidden" name="date" value={date} />
              {day.pending > 0 && <p className="mb-2 text-xs text-gold-600">Atenção: {day.pending} entrevista(s) sem resultado serão informadas como pendentes.</p>}
              <Submit className="btn-gold w-full" pendingText="Encerrando…">Encerrar agenda {isToday ? "de hoje" : `de ${dateBR(date)}`} e enviar resultados</Submit>
            </ActionForm>
          )}
        </Card>

        <div className="space-y-6">
          <Card title={`Avisos de agenda a enviar (${pending.length})`}>
            {pending.length === 0 ? <Empty>Nenhum aviso aguardando.</Empty> : (
              <ul className="divide-y divide-stone-100">
                {pending.map((d) => (
                  <li key={d.id} className="py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-riale-900">{d.manager.name} · {weekdayLong(d.date)}, {dateBR(d.date)}{d.version > 1 ? ` · atualização (v${d.version})` : ""}</p>
                        <p className="text-xs text-stone-500">{d.status === "AGUARDANDO_REVISAO" ? "Aguardando sua revisão para enviar" : `Envio automático às ${timeKey(d.scheduledFor)}`}</p>
                      </div>
                      <Badge tone={DIGEST_STATUS[d.status].t}>{DIGEST_STATUS[d.status].l}</Badge>
                    </div>
                    {manage && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={`/comunicacoes/${d.id}`} className="btn-ghost btn-sm">Ver / editar texto</Link>
                        <ActionForm action={sendNowAction}><input type="hidden" name="id" value={d.id} /><Submit className="btn-primary btn-sm" pendingText="…">Enviar agora</Submit></ActionForm>
                        <ActionForm action={cancelDigestAction}><input type="hidden" name="id" value={d.id} /><Submit className="btn-ghost btn-sm" pendingText="…">Não enviar</Submit></ActionForm>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Alterações após o fechamento (${rects.length})`}>
            {rects.length === 0 ? <Empty>Nenhuma alteração depois dos fechamentos dos últimos 14 dias.</Empty> : (
              <ul className="divide-y divide-stone-100">
                {rects.map((r) => (
                  <li key={`${r.managerId}-${r.date}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span><span className="font-medium text-riale-900">{r.managerName}</span> · {dateBR(r.date)}<span className="block text-xs text-stone-500">{r.changes} alteração(ões) desde o envio {r.lastEmittedAt ? `de ${fmtDateTime(r.lastEmittedAt)}` : ""}</span></span>
                    {manage && <ActionForm action={rectifyAction}><input type="hidden" name="managerId" value={r.managerId} /><input type="hidden" name="date" value={r.date} /><Submit className="btn-gold btn-sm" pendingText="…">Emitir retificação</Submit></ActionForm>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Comunicações emitidas" className="mt-6">
        {recent.length === 0 ? <Empty>Nenhuma comunicação emitida ainda.</Empty> : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Tipo</th><th>Gestor</th><th>Data</th><th>Situação</th><th>Entrega</th></tr></thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.id}>
                    <td className="text-xs"><Link href={`/comunicacoes/${d.id}`} className="font-medium text-riale-900 hover:underline">{d.type === "AGENDA" ? (d.version > 1 ? `Atualização da agenda (v${d.version})` : "Aviso de agenda") : d.isRectification ? `Retificação (v${d.version})` : "Fechamento do dia"}</Link></td>
                    <td className="text-xs">{d.manager.name}<p className="text-stone-400">{d.manager.email}</p></td>
                    <td className="text-xs">{dateBR(d.date)}</td>
                    <td><Badge tone={DIGEST_STATUS[d.status].t}>{DIGEST_STATUS[d.status].l}</Badge>{d.note && <p className="mt-1 max-w-xs text-[11px] text-stone-500">{d.note}</p>}</td>
                    <td className="text-xs">{d.notification ? <><Badge tone={MSG_STATUS[d.notification.status].t}>{MSG_STATUS[d.notification.status].l}</Badge>{d.notification.sentAt && <p className="text-stone-400">{fmtDateTime(d.notification.sentAt)}</p>}</> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card title="Fila e histórico de e-mails">
          {messages.length === 0 ? <Empty>Nenhum e-mail.</Empty> : (
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Quando</th><th>Mensagem</th><th>Para</th><th>Situação</th><th /></tr></thead>
                <tbody>
                  {messages.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td>
                      <td className="max-w-xs text-xs"><p className="font-medium text-riale-900">{TEMPLATE[m.template] ?? m.template}</p><p className="truncate text-stone-500">{m.subject}</p></td>
                      <td className="text-xs">{m.recipientEmail}{m.cc.length > 0 && <p className="text-stone-400">cc: {m.cc.join(", ")}</p>}</td>
                      <td className="text-xs">
                        <Badge tone={MSG_STATUS[m.status].t}>{MSG_STATUS[m.status].l}</Badge>
                        <p className="text-stone-400">{m.attempts} tentativa(s){m.status === "PENDENTE" && m.attempts > 0 ? ` · próxima ${timeKey(m.nextAttemptAt)}` : ""}</p>
                        {m.error && <p className="max-w-[220px] text-[11px] text-red-700">{m.error}</p>}
                      </td>
                      <td>{manage && ["FALHOU", "PENDENTE"].includes(m.status) && cfg.ready && <ActionForm action={retryAction}><input type="hidden" name="id" value={m.id} /><Submit className="btn-ghost btn-sm" pendingText="…">Reenviar</Submit></ActionForm>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Configuração do envio">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-stone-500">Situação</dt><dd>{cfg.ready ? <Badge tone="green">Configurado</Badge> : <Badge tone="red">Incompleto</Badge>}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Provedor</dt><dd>{cfg.provider === "smtp" ? "SMTP (e-mail corporativo)" : cfg.provider === "resend" ? "Resend" : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-stone-500">Remetente</dt><dd className="truncate text-right">{cfg.from ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Fechamento</dt><dd>{day.auto ? `automático às ${day.closingTime}` : "manual"}</dd></div>
          </dl>
          {cfg.ready && manage && <ActionForm action={testEmailAction} className="mt-3"><Submit className="btn-ghost w-full" pendingText="Enviando…">Enviar e-mail de teste para mim</Submit></ActionForm>}
          {!cfg.ready && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Variáveis a cadastrar na Vercel (Settings › Environment Variables)</p>
              <ul className="space-y-2 text-xs">
                {EMAIL_SETUP_GUIDE.map((v) => (
                  <li key={v.name} className={cfg.missing.some((m) => m.startsWith(v.name)) ? "text-red-800" : "text-stone-600"}>
                    <code className="font-mono font-semibold">{v.name}</code> = <span className="font-mono">{v.example}</span>{v.note && <span className="block text-stone-400">{v.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-stone-500">Horário do fechamento, espera para consolidar avisos e cópia (CC): <Link href="/configuracoes/sistema" className="text-gold-600 underline">Configurações › Sistema</Link>.</p>
        </Card>
      </div>
      <p className="mt-3 text-xs text-stone-400">Última atualização: {fmtDateTime(new Date())} · dia de referência {dateKey(new Date())}</p>
    </>
  );
}
