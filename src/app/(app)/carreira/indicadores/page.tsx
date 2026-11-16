import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { fmtDate } from "@/lib/datetime";
import { GRAN_LABEL, shiftPeriod, type Granularity } from "@/modules/analytics/periods";
import { careerIndicators, type CareerQuery } from "@/modules/career/indicators";
import { ELIGIBILITY_LABEL } from "@/modules/career/rules";
import { NOT_AUTOMATIC } from "@/modules/career/constants";
import { BarList, RateTile } from "@/components/charts";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { brl } from "@/components/rem-tabs";

export const metadata = { title: "Indicadores de carreira" };

const ONE: Record<string, string> = { PROMOCAO: "promoção", MUDANCA_CARGO: "mudança de cargo", TRANSFERENCIA_DEPARTAMENTO: "transferência de departamento", TRANSFERENCIA_UNIDADE: "transferência de unidade", MUDANCA_GESTOR: "troca de gestor", ALTERACAO_SALARIAL: "alteração salarial" };
export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p><p className="font-serif text-2xl font-semibold tabular-nums text-riale-900">{value}</p>{hint && <p className="text-[10px] text-stone-400">{hint}</p>}</div>;
}

export default async function CareerIndicatorsPage({ searchParams }: { searchParams: Promise<CareerQuery> }) {
  const user = await requirePermission("carreira.view");
  const sp = await searchParams;
  const r = await careerIndicators(user, sp);
  const [units, families] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...(user.role === "RH" && user.unitId ? { id: user.unitId } : {}) }, orderBy: { name: "asc" } }),
    prisma.careerTrack.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const qs = (p: Partial<CareerQuery>) => "?" + new URLSearchParams(Object.entries({ ...sp, gran: r.period.gran, ref: r.period.from, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const c = r.eligibility.counts;
  return (
    <>
      <PageHeader title="Indicadores de carreira" subtitle={`${r.period.label} · elegibilidade, movimentações, promoções, distribuição salarial, sucessão e recrutamento interno`} breadcrumb={{ href: "/carreira", label: "Trilhas de carreira" }} />
      <form className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-xs">{(Object.keys(GRAN_LABEL) as Granularity[]).map((g) => <Link key={g} href={qs({ gran: g })} className={`px-3 py-1.5 ${r.period.gran === g ? "bg-riale-800 text-white" : "text-stone-600 hover:bg-riale-50"}`}>{GRAN_LABEL[g]}</Link>)}</div>
        <Link href={qs({ ref: shiftPeriod(r.period, -1).from })} className="btn-ghost btn-sm" aria-label="Período anterior">‹</Link>
        <span className="min-w-32 text-center font-serif text-lg text-riale-900 first-letter:uppercase">{r.period.label}</span>
        <Link href={qs({ ref: shiftPeriod(r.period, 1).from })} className="btn-ghost btn-sm" aria-label="Próximo período">›</Link>
        <input type="hidden" name="gran" value={r.period.gran} /><input type="hidden" name="ref" value={r.period.from} />
        <select name="unidade" defaultValue={sp.unidade ?? ""} className="input w-auto py-1.5 text-xs" aria-label="Unidade"><option value="">Unidade: todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select name="familia" defaultValue={sp.familia ?? ""} className="input w-auto max-w-56 py-1.5 text-xs" aria-label="Família"><option value="">Família: todas</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <button className="btn-primary btn-sm">Aplicar</button>
      </form>

      <Card title={`Elegibilidade para progressão — situação hoje (${r.eligibility.activeTotal} ativos, ${r.eligibility.pathsCount} trilha(s) vigente(s))`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Tile label="Atendem tempo e nota" value={c.ELEGIVEL} hint="podem ser indicados ao comitê" />
          <Tile label="Falta avaliação" value={c.FALTA_AVALIACAO} hint="tempo cumprido" />
          <Tile label="Nota abaixo do mínimo" value={c.NOTA_ABAIXO} hint={`mínimo ${r.threshold}`} />
          <Tile label="Tempo não cumprido" value={c.FALTA_TEMPO} />
          <Tile label="Sem trilha vigente" value={c.SEM_TRILHA} hint="cargo fora das trilhas" />
        </div>
        <p className="mt-2 text-[11px] text-stone-400">{NOT_AUTOMATIC}</p>
        {r.eligibility.list.length > 0 && (
          <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-riale-900">Ver colaboradores ({r.eligibility.list.length})</summary>
            <ul className="mt-2 divide-y divide-stone-100 text-sm">{r.eligibility.list.map((x) => <li key={x.id} className="flex flex-wrap justify-between gap-2 py-1.5"><Link href={`/carreira/colaborador/${x.id}`} className="hover:underline">{x.name} <span className="text-xs text-stone-500">{x.position} → {x.best!.next} · {x.unit}</span></Link><Badge tone={x.best!.e.status === "ELEGIVEL" ? "green" : x.best!.e.status === "FALTA_AVALIACAO" ? "gold" : "gray"}>{ELIGIBILITY_LABEL[x.best!.e.status]}</Badge></li>)}</ul>
          </details>
        )}
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Movimentações internas no período"><BarList rows={r.movements.byType} valueLabel="movimentações" emptyText="Nenhuma movimentação no período." /></Card>
        <RateTile title="Taxa de promoção" r={r.promotions.rate} />
        <RateTile title="Vagas preenchidas internamente" r={r.internalFill.rate} />
      </div>

      <Card title="Potenciais sucessores (cargos de liderança nas trilhas vigentes)" className="mt-6">
        {r.successors.length === 0 ? <Empty>Nenhum cargo de liderança nas trilhas vigentes.</Empty> : (
          <ul className="space-y-4">
            {r.successors.map((s) => (
              <li key={`${s.path}-${s.positionId}`} className="rounded-lg border border-stone-200 p-3 text-sm">
                <p className="font-medium text-riale-900">{s.title} <span className="text-xs font-normal text-stone-500">· {s.incumbents} ocupante(s) · sucessão a partir de {s.feeder} · {s.path}</span></p>
                <p className="mt-1 text-xs"><span className="font-semibold text-emerald-700">Atendem os critérios ({s.ready.length}):</span> {s.ready.map((x) => x.name).join(", ") || "ninguém"}</p>
                <p className="text-xs"><span className="font-semibold text-gold-600">Em desenvolvimento ({s.developing.length}):</span> {s.developing.map((x) => `${x.name} (${x.e.missingMonths ? `faltam ${x.e.missingMonths} meses` : x.score === null ? "sem avaliação" : `nota ${x.score}`})`).join(", ") || "ninguém"}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {r.distribution ? (
        <Card title="Distribuição salarial na faixa (salário-base vigente dos ativos)" className="mt-6">
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="bg-riale-50 text-right text-[11px] uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2 text-left">Cargo</th><th className="px-2">n</th><th className="px-2">Mínimo pago</th><th className="px-2">Mediana</th><th className="px-2">Máximo pago</th><th className="px-2">Faixa (mín · ref · máx)</th><th className="px-2">Abaixo</th><th className="px-2">Dentro</th><th className="px-2">Acima</th><th className="px-5">Compa-ratio médio</th></tr></thead>
              <tbody className="divide-y divide-stone-100 text-right tabular-nums">
                {r.distribution.map((d) => <tr key={d.positionId}><td className="px-5 py-2 text-left">{d.title}</td><td className="px-2">{d.n}</td><td className="px-2">{brl(d.min)}</td><td className="px-2">{brl(d.median)}</td><td className="px-2">{brl(d.max)}</td><td className="px-2 text-xs">{d.band ? `${brl(d.band.min)} · ${brl(d.band.ref)} · ${brl(d.band.max)}` : "não cadastrada"}</td><td className={`px-2 ${d.below ? "font-medium text-red-700" : ""}`}>{d.below}</td><td className="px-2">{d.within}</td><td className="px-2">{d.above}{d.noBand ? <span className="block text-[10px] text-stone-400">{d.noBand} sem faixa</span> : null}</td><td className="px-5">{d.avgCompa === null ? "—" : String(d.avgCompa).replace(".", ",")}</td></tr>)}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      ) : <p className="mt-6 text-xs text-stone-400">Distribuição salarial visível apenas para quem tem acesso à remuneração.</p>}

      <Card title="Movimentações recentes" className="mt-6">
        {r.movements.list.length === 0 ? <Empty>Nenhuma.</Empty> : <ul className="divide-y divide-stone-100 text-sm">{r.movements.list.map((m) => <li key={m.id} className="py-1.5">{fmtDate(m.effectiveDate)} · <span className="font-medium">{m.employee}</span> · {ONE[m.type] ?? m.type} · <span className="text-stone-500">{m.reason}</span></li>)}</ul>}
      </Card>
    </>
  );
}
