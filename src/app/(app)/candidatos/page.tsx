import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/datetime";
import { formatPhone } from "@/lib/text";
import { listCandidates } from "@/modules/recruitment/candidates";
import { APP_STATUS_LABEL, APP_STATUS_TONE, RESULT_LABEL, RESULT_TONE } from "@/modules/recruitment/constants";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";

export const metadata = { title: "Candidatos" };

const STATUS = ["ENTREVISTA", "AGUARDANDO_GESTOR", "AVALIACAO", "APROVADO", "REPROVADO", "DESISTENTE", "BANCO_TALENTOS"] as const;

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; p?: string }> }) {
  const user = await requirePermission("candidatos.view");
  const sp = await searchParams;
  const { rows, total, page, pages } = await listCandidates(user, { q: sp.q, status: sp.status, page: Number(sp.p) || 1 });
  const qs = (p: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ q: sp.q, status: sp.status, ...p }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Candidatos"
        subtitle={`${total} candidato(s). Busque por nome ou telefone antes de cadastrar — o sistema também confere duplicidades ao salvar.`}
        actions={can(user, "recrutamento.manage") && <Link href="/candidatos/novo" className="btn-gold">+ Novo candidato</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q} placeholder="Nome, telefone ou e-mail…" className="input w-72 py-1.5" autoFocus />
          <button className="btn-ghost btn-sm">Buscar</button>
        </form>
        <span className="mx-1 h-5 w-px bg-stone-300" />
        <Link href={qs({ status: undefined, p: undefined })} className={`chip ${!sp.status ? "chip-active" : ""}`}>Todos</Link>
        {STATUS.map((s) => <Link key={s} href={qs({ status: s, p: undefined })} className={`chip ${sp.status === s ? "chip-active" : ""}`}>{APP_STATUS_LABEL[s]}</Link>)}
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty>Nenhum candidato encontrado.</Empty>
        ) : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Candidato</th><th>Vaga</th><th>Última entrevista</th><th>Situação</th></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const a = c.applications[0];
                  const iv = a?.interviews[0];
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/candidatos/${c.id}`} className="font-medium text-riale-900 hover:underline">{c.fullName}</Link><p className="text-xs text-stone-400">{formatPhone(c.phone)}{c.email ? ` · ${c.email}` : ""}</p></td>
                      <td className="text-sm">{a ? <>{a.jobOpening.position.title}<p className="text-xs text-stone-400">{a.jobOpening.department.unit.name} · {a.jobOpening.code}{c.applications.length > 1 ? ` · +${c.applications.length - 1} vaga(s)` : ""}</p></> : <span className="text-stone-400">{c.desiredPosition?.title ?? "Sem vaga"}</span>}</td>
                      <td className="text-xs">{iv ? <>{fmtDateTime(iv.scheduledAt, iv.hasTime)} <Badge tone={RESULT_TONE[iv.result]}>{RESULT_LABEL[iv.result]}</Badge></> : "—"}</td>
                      <td>{a ? <Badge tone={APP_STATUS_TONE[a.status]}>{APP_STATUS_LABEL[a.status]}</Badge> : <Badge>Banco de talentos</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        {pages > 1 && (
          <div className="mt-8 flex items-center justify-between text-xs text-stone-500">
            <span>Página {page} de {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ p: String(page - 1) })}>Anterior</Link>}
              {page < pages && <Link className="btn-ghost btn-sm" href={qs({ p: String(page + 1) })}>Próxima</Link>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
