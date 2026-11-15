import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { fmtDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/text";
import { listJobs } from "@/modules/recruitment/jobs";
import { listUnits } from "@/modules/org/service";
import { JOB_STATUS_LABEL, SCHEDULE_LABEL, SHIFT_LABEL } from "@/modules/recruitment/constants";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";

export const metadata = { title: "Vagas" };

const FILTERS = [
  { v: "ativas", l: "Em andamento" },
  { v: "PREENCHIDA", l: "Preenchidas" },
  { v: "CANCELADA", l: "Canceladas" },
  { v: "todas", l: "Todas" },
];

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; unidade?: string; q?: string; historico?: string }> }) {
  const user = await requirePermission("vagas.view");
  const sp = await searchParams;
  const [jobs, units] = await Promise.all([listJobs(user, { status: sp.status, unitId: sp.unidade, q: sp.q, includeHistorical: sp.historico === "1" }), listUnits(user)]);
  const qs = (p: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ status: sp.status, unidade: sp.unidade, q: sp.q, historico: sp.historico, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const status = sp.status ?? "ativas";

  return (
    <>
      <PageHeader
        title="Vagas"
        subtitle="Cada vaga recebe um código automático. O gestor responsável recebe os candidatos aprovados pelo RH."
        actions={can(user, "recrutamento.manage") && <Link href="/vagas/nova" className="btn-gold">+ Nova vaga</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => <Link key={f.v} href={qs({ status: f.v })} className={`chip ${status === f.v ? "chip-active" : ""}`}>{f.l}</Link>)}
        {units.length > 1 && <span className="mx-1 h-5 w-px bg-stone-300" />}
        {units.length > 1 && <Link href={qs({ unidade: undefined })} className={`chip ${!sp.unidade ? "chip-active" : ""}`}>Todas as unidades</Link>}
        {units.length > 1 && units.map((u) => <Link key={u.id} href={qs({ unidade: u.id })} className={`chip ${sp.unidade === u.id ? "chip-active" : ""}`}>{u.name}</Link>)}
        <form className="ml-auto flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q} placeholder="Buscar cargo ou código…" className="input w-56 py-1.5" />
        </form>
      </div>
      <Card>
        {jobs.length === 0 ? (
          <Empty>Nenhuma vaga neste filtro. {can(user, "recrutamento.manage") && <Link href="/vagas/nova" className="text-gold-600 underline">Criar vaga</Link>}</Empty>
        ) : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Vaga</th><th>Local</th><th>Gestor</th><th>Condições</th><th className="text-center">Candidatos</th><th>Status</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="cursor-pointer">
                    <td>
                      <Link href={`/vagas/${j.id}`} className="font-medium text-riale-900 hover:underline">{j.position.title}</Link>
                      <p className="font-mono text-[11px] text-stone-400">{j.code} · aberta em {fmtDate(j.openedAt)}{j.headcount > 1 ? ` · ${j.headcount} vagas` : ""}</p>
                    </td>
                    <td><p>{j.department.unit.name}</p><p className="text-xs text-stone-400">{j.department.name}</p></td>
                    <td className="text-sm">{j.requestingManager?.name ?? <span className="text-red-600">sem gestor</span>}</td>
                    <td className="text-xs text-stone-500">
                      {[j.expectedSalary && formatMoney(j.expectedSalary), j.schedule && SCHEDULE_LABEL[j.schedule], j.shift && SHIFT_LABEL[j.shift], j.weeklyHours && `${j.weeklyHours}h`].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="text-center">
                      <span className="font-semibold text-riale-900">{j.counts.total}</span>
                      {j.counts.aguardandoGestor > 0 && <p className="text-[11px] text-gold-600">{j.counts.aguardandoGestor} com o gestor</p>}
                      {j.counts.aprovados > 0 && <p className="text-[11px] text-emerald-700">{j.counts.aprovados} aprovado(s)</p>}
                    </td>
                    <td><Badge tone={j.status === "ABERTA" ? "green" : j.status === "PAUSADA" ? "gold" : "gray"}>{JOB_STATUS_LABEL[j.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <p className="mt-3 text-xs text-stone-400">
        <Link href={qs({ historico: sp.historico === "1" ? undefined : "1", status: "todas" })} className="hover:underline">
          {sp.historico === "1" ? "Ocultar vagas históricas (importadas da planilha)" : "Mostrar vagas históricas importadas da planilha"}
        </Link>
      </p>
    </>
  );
}
