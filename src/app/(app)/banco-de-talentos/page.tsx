import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { fmtDate } from "@/lib/datetime";
import { formatPhone } from "@/lib/text";
import { listTalentPool, matchesForPosition } from "@/modules/career/talent";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { talentAction, talentStatusAction } from "../carreira/actions";

export const metadata = { title: "Banco de talentos" };
export const dynamic = "force-dynamic";

export default async function TalentPage({ searchParams }: { searchParams: Promise<{ cargo?: string; status?: string }> }) {
  const user = await requirePermission("candidatos.view");
  const sp = await searchParams;
  const manage = can(user, "recrutamento.manage");
  const [entries, positions, matches] = await Promise.all([
    listTalentPool(user, sp),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    sp.cargo ? matchesForPosition(user, sp.cargo) : Promise.resolve(null),
  ]);
  const pos = positions.find((p) => p.id === sp.cargo);
  return (
    <>
      <PageHeader title="Banco de talentos" subtitle="Candidatos com experiência ou competências compatíveis com posições da empresa — inclusive diferentes da vaga que disputaram." />
      <form className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <select name="cargo" defaultValue={sp.cargo ?? ""} className="input w-auto max-w-72 py-1.5 text-sm" aria-label="Cargo"><option value="">Todos os cargos</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1.5 text-sm" aria-label="Situação"><option value="">Ativos e contatados</option><option value="ATIVO">Ativos</option><option value="CONTATADO">Contatados</option><option value="ARQUIVADO">Arquivados</option><option value="TODOS">Todos</option></select>
        <button className="btn-primary btn-sm">Filtrar</button>
      </form>

      {matches && (
        <Card title={`Compatíveis com ${pos?.title} — sugestão por evidências (${matches.length})`} className="mb-6">
          {matches.length === 0 ? <Empty>Nenhum candidato com evidência de compatibilidade. Registre experiências e competências nos perfis dos candidatos.</Empty> : (
            <ul className="divide-y divide-stone-100 text-sm">
              {matches.map((m) => (
                <li key={m.candidateId} className="flex flex-wrap items-center justify-between gap-2 py-2" data-match={m.name}>
                  <span><Link href={`/candidatos/${m.candidateId}`} className="font-medium text-riale-900 hover:underline">{m.name}</Link> {m.level && <Badge tone={m.level === "FORTE" ? "green" : "gold"}>{m.level === "FORTE" ? "compatível" : "parcialmente compatível"}</Badge>}<span className="block text-xs text-stone-500">{m.evidence.join(" · ") || "sem evidências"} · {formatPhone(m.phone)}</span></span>
                  {m.pool ? <Badge>{m.pool.status.toLowerCase()} no banco</Badge> : manage && (
                    <ActionForm action={talentAction} className="flex gap-1"><input type="hidden" name="candidateId" value={m.candidateId} /><input type="hidden" name="positionId" value={sp.cargo} /><input type="hidden" name="reason" value={m.evidence.join("; ") || "Indicado pelo RH"} /><Submit className="btn-ghost btn-sm" pendingText="…">Incluir no banco</Submit></ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-stone-400">Compatível = experiência no cargo ou no anterior da trilha (ou aprovação do RH para o cargo) e escolaridade atendida. Parcial = alguma evidência. É apoio à triagem — a decisão continua do RH.</p>
        </Card>
      )}

      <Card title={`No banco de talentos (${entries.length})`}>
        {entries.length === 0 ? <Empty>Nenhum candidato no banco{pos ? ` para ${pos.title}` : ""}.</Empty> : (
          <ul className="divide-y divide-stone-100 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/candidatos/${e.candidate.id}`} className="font-medium text-riale-900 hover:underline">{e.candidate.fullName}</Link> → {e.position.title} <Badge tone={e.status === "ATIVO" ? "green" : e.status === "CONTATADO" ? "blue" : "gray"}>{e.status.toLowerCase()}</Badge><span className="block text-xs text-stone-500">{e.reason} · desde {fmtDate(e.createdAt)}{e.note ? ` · ${e.note}` : ""}</span></span>
                {manage && <ActionForm action={talentStatusAction} className="flex gap-1"><input type="hidden" name="id" value={e.id} /><select name="status" defaultValue={e.status} className="input w-auto py-1 text-xs" aria-label="Situação"><option value="ATIVO">Ativo</option><option value="CONTATADO">Contatado</option><option value="ARQUIVADO">Arquivado</option></select><Submit className="btn-ghost btn-sm" pendingText="…">ok</Submit></ActionForm>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
