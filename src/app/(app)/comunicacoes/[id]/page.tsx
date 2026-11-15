import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/datetime";
import { getDigest } from "@/modules/email/service";
import { dateBR, previewAgenda, weekdayLong } from "@/modules/email/digests";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { cancelDigestAction, editDigestAction, sendNowAction } from "../actions";

export const metadata = { title: "Comunicação" };

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("comunicacoes.view");
  const { id } = await params;
  const d = await getDigest(user, id);
  const editable = ["PENDENTE", "AGUARDANDO_REVISAO"].includes(d.status) && d.type === "AGENDA";
  const p = editable ? await previewAgenda(id) : null;
  const manage = can(user, "comunicacoes.manage");
  const title = d.type === "AGENDA" ? (d.version > 1 ? "Atualização da agenda" : "Aviso de agenda") : d.isRectification ? "Retificação do fechamento" : "Fechamento do dia";

  return (
    <>
      <PageHeader title={title} subtitle={`${d.manager.name} <${d.manager.email}> · ${weekdayLong(d.date)}, ${dateBR(d.date)} · versão ${d.version}`} breadcrumb={{ href: "/comunicacoes", label: "Comunicação com gestores" }} />
      {d.note && <p className="mb-4 rounded-lg bg-gold-100 px-4 py-2 text-sm text-gold-600">{d.note}</p>}
      {editable && p ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card title="Texto do e-mail (pode editar antes do envio)">
            {p.unchanged && <p className="mb-3 rounded bg-stone-100 px-3 py-2 text-xs text-stone-600">A agenda está igual ao último aviso enviado — ao enviar, o sistema não repetirá a mensagem.</p>}
            {p.customDiscarded && <p className="mb-3 rounded bg-gold-100 px-3 py-2 text-xs text-gold-600">A agenda mudou depois da sua edição: abaixo está o texto atualizado.</p>}
            {manage ? (
              <ActionForm action={editDigestAction} className="space-y-3">
                <input type="hidden" name="id" value={d.id} />
                <div><label className="label" htmlFor="subject">Assunto</label><input id="subject" name="subject" className="input" defaultValue={p.subject} /></div>
                <div><label className="label" htmlFor="body">Mensagem</label><textarea id="body" name="body" className="input min-h-[360px] font-mono text-[13px]" defaultValue={p.text} /></div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" name="then" value="enviar" className="btn-gold">Salvar e enviar agora</button>
                  <button type="submit" name="then" value="salvar" className="btn-ghost">Salvar texto</button>
                </div>
              </ActionForm>
            ) : <pre className="whitespace-pre-wrap text-sm">{p.text}</pre>}
          </Card>
          <div className="space-y-6">
            <Card title="Envio">
              <p className="text-sm text-stone-600">{d.status === "AGUARDANDO_REVISAO" ? "Aguardando sua revisão." : `Envio automático às ${fmtDateTime(d.scheduledFor)}.`}</p>
              {manage && (
                <div className="mt-3 flex gap-2">
                  <ActionForm action={sendNowAction}><input type="hidden" name="id" value={d.id} /><Submit className="btn-primary btn-sm">Enviar texto padrão agora</Submit></ActionForm>
                  <ActionForm action={cancelDigestAction}><input type="hidden" name="id" value={d.id} /><Submit className="btn-ghost btn-sm">Não enviar</Submit></ActionForm>
                </div>
              )}
            </Card>
            <Card title={`Entrevistas (${p.items.length})`}>
              <ul className="space-y-1 text-sm">{p.items.map((i) => <li key={i.id}><span className="font-mono">{i.time}</span> {i.candidate} <span className="text-xs text-stone-400">{i.job}</span></li>)}</ul>
            </Card>
          </div>
        </div>
      ) : (
        <Card title={d.subject ?? title} actions={d.notification && <Badge tone={d.notification.status === "ENVIADA" ? "green" : d.notification.status === "FALHOU" ? "red" : "gold"}>{d.notification.status === "ENVIADA" ? `Enviada ${fmtDateTime(d.notification.sentAt)}` : d.notification.status === "FALHOU" ? "Falhou" : "Na fila"}</Badge>}>
          {d.bodyText ? <pre className="whitespace-pre-wrap font-sans text-sm text-stone-800">{d.bodyText}</pre> : <p className="text-sm text-stone-500">Nenhuma mensagem foi gerada ({d.status === "DESCARTADO" ? "não enviada" : d.status}).</p>}
          {d.notification?.error && <p className="mt-3 text-xs text-red-700">Último erro: {d.notification.error}</p>}
          <p className="mt-4 text-xs text-stone-400">Emitida em {fmtDateTime(d.emittedAt)} · <Link href="/comunicacoes" className="underline">voltar</Link></p>
        </Card>
      )}
    </>
  );
}
