import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/datetime";
import { GRAN_LABEL, shiftPeriod, type Granularity } from "@/modules/analytics/periods";
import { buildPermanence, type PermanenceQuery } from "@/modules/people/report";
import type { TurnoverRow } from "@/modules/people/metrics";
import { ColumnTrend, RateTile, fmtDays, pct } from "@/components/charts";
import { Card, PageHeader, TableWrap } from "@/components/ui";

export const metadata = { title: "Permanência e turnover" };
export const dynamic = "force-dynamic";

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="font-serif text-2xl font-semibold tabular-nums text-riale-900">{value}</p>
      {hint && <p className="text-[10px] text-stone-400">{hint}</p>}
    </div>
  );
}

const pctN = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const years = (d: number | null) => (d && d >= 365 ? ` ≈ ${(d / 365.25).toFixed(1).replace(".", ",")} anos` : "");
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));

function TurnoverTable({ rows, first }: { rows: TurnoverRow[]; first: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-stone-400">Sem colaboradores no período.</p>;
  return (
    <TableWrap>
      <table className="w-full text-sm">
        <thead className="bg-riale-50 text-right text-[11px] uppercase tracking-wide text-stone-500">
          <tr><th className="px-5 py-2 text-left">{first}</th><th className="px-2 py-2">Início</th><th className="px-2 py-2">Fim</th><th className="px-2 py-2">Médio</th><th className="px-2 py-2">Admissões</th><th className="px-2 py-2">Deslig.</th><th className="px-2 py-2">Voluntários</th><th className="px-2 py-2">Turnover</th><th className="px-5 py-2">Rotatividade</th></tr>
        </thead>
        <tbody className="divide-y divide-stone-100 text-right tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}><td className="px-5 py-2 text-left text-stone-700">{r.label}</td><td className="px-2 py-2">{r.start}</td><td className="px-2 py-2">{r.end}</td><td className="px-2 py-2">{num(r.avg)}</td><td className="px-2 py-2">{r.admissions}</td><td className="px-2 py-2">{r.terminations}</td><td className="px-2 py-2">{r.voluntary}</td><td className="px-2 py-2 font-medium text-riale-900">{pctN(r.turnover)}</td><td className="px-5 py-2">{pctN(r.rotatividade)}</td></tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export default async function PermanencePage({ searchParams }: { searchParams: Promise<PermanenceQuery> }) {
  const user = await requirePermission("relatorios.view");
  const sp = await searchParams;
  const r = await buildPermanence(user, sp);
  const qs = (p: Partial<PermanenceQuery>) => "?" + new URLSearchParams(Object.entries({ ...sp, gran: r.period.gran, ref: r.period.from, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const prev = shiftPeriod(r.period, -1), next = shiftPeriod(r.period, 1);
  const sel = (name: keyof PermanenceQuery, label: string, opts: Array<{ value: string; label: string }>) => (
    <select name={name} defaultValue={sp[name] ?? ""} className="input w-auto max-w-48 py-1.5 text-xs" aria-label={label}><option value="">{label}: todos</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  );

  return (
    <>
      <PageHeader title="Permanência e turnover" subtitle={`${r.period.label} · calculado das datas de admissão e desligamento, atualizado em ${fmtDateTime(new Date())}`} breadcrumb={{ href: "/relatorios", label: "Indicadores de recrutamento" }} />
      <form className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-xs">
          {(Object.keys(GRAN_LABEL) as Granularity[]).map((g) => <Link key={g} href={qs({ gran: g })} className={`px-3 py-1.5 ${r.period.gran === g ? "bg-riale-800 text-white" : "text-stone-600 hover:bg-riale-50"}`}>{GRAN_LABEL[g]}</Link>)}
        </div>
        <Link href={qs({ ref: prev.from })} className="btn-ghost btn-sm" aria-label="Período anterior">‹</Link>
        <span className="min-w-36 text-center font-serif text-lg text-riale-900 first-letter:uppercase">{r.period.label}</span>
        <Link href={qs({ ref: next.from })} className="btn-ghost btn-sm" aria-label="Próximo período">›</Link>
        <input type="hidden" name="gran" value={r.period.gran} /><input type="hidden" name="ref" value={r.period.from} />
        {sel("unidade", "Unidade", r.options.units)}
        {sel("departamento", "Departamento", r.options.departments)}
        {sel("cargo", "Cargo", r.options.positions)}
        <button className="btn-primary btn-sm">Aplicar</button>
        <Link href={`?gran=${r.period.gran}&ref=${r.period.from}`} className="text-xs text-stone-500 hover:underline">limpar</Link>
      </form>

      <p className="mb-4 rounded-lg bg-gold-100/50 px-4 py-2 text-xs text-stone-600">
        Base: {r.base.total} colaborador(es) cadastrados na plataforma ({r.base.recrutamento} admitidos pelo processo seletivo, {r.base.direto} cadastrados diretamente).
        O turnover só é representativo quando todo o quadro estiver cadastrado — colaboradores fora da plataforma não entram no efetivo.
      </p>

      <Card title="Quadro no período">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          <Kpi label="Efetivo no início" value={r.headcount.start} />
          <Kpi label="Efetivo no fim" value={r.headcount.end} />
          <Kpi label="Admissões" value={r.admissions} />
          <Kpi label="Desligamentos" value={r.terminations} />
          <Kpi label="Turnover" value={pctN(r.total?.turnover ?? null)} hint="desligamentos ÷ efetivo médio" />
          <Kpi label="Na experiência" value={r.probation.count} hint="desligados até o fim da experiência" />
          <Kpi label="Tempo de casa (ativos)" value={fmtDays(r.active.mean)} hint={`média hoje${years(r.active.mean)} · n = ${r.active.n}`} />
          <Kpi label="Permanência (desligados)" value={fmtDays(r.leavers.mean)} hint={`média${years(r.leavers.mean)} · mediana ${fmtDays(r.leavers.median)} · n = ${r.leavers.n}`} />
        </div>
      </Card>

      <h2 className="mt-8 mb-3 font-serif text-xl text-riale-900">Retenção na experiência</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {r.retention.map((x) => <RateTile key={x.days} title={`Retenção em ${x.days} dias`} r={x.r} />)}
        <RateTile title="Desligamentos na experiência" r={r.probation.share} />
      </div>
      {r.probation.count > 0 && (
        <p className="mt-2 text-xs text-stone-500">Iniciativa dos desligamentos na experiência: {Object.entries(r.probation.byInitiative).map(([k, v]) => `${k}: ${v}`).join(" · ")} · dos admitidos (CLT) no período: {pct(r.probation.ofAdmissions)} ({r.probation.ofAdmissions.num} de {r.probation.ofAdmissions.den}).</p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title={`Admissões por ${GRAN_LABEL[r.period.gran].toLowerCase()} (últimos ${r.trend.length})`}><ColumnTrend data={r.trend.map((t) => ({ key: t.key, label: t.label, value: t.admissions }))} measure="admissões" label="Admissões registradas" /></Card>
        <Card title={`Desligamentos por ${GRAN_LABEL[r.period.gran].toLowerCase()} (últimos ${r.trend.length})`}><ColumnTrend data={r.trend.map((t) => ({ key: t.key, label: t.label, value: t.terminations }))} measure="desligamentos" label="Desligamentos registrados" /></Card>
      </div>

      <h2 className="mt-8 mb-3 font-serif text-xl text-riale-900">Turnover</h2>
      <div className="space-y-6">
        <Card title="Por unidade"><TurnoverTable rows={r.byUnit} first="Unidade" /></Card>
        <Card title="Por cargo"><TurnoverTable rows={r.byPosition} first="Cargo" /></Card>
      </div>
      <p className="mt-6 text-xs text-stone-400">
        Regras: efetivo no início = ativos no 1º dia do período; no fim = ativos ao fim do último dia; turnover = desligamentos ÷ efetivo médio; rotatividade = ((admissões + desligamentos) ÷ 2) ÷ efetivo médio;
        voluntários = pedido de demissão e rescisão antecipada pelo colaborador. Retenção em N dias: coorte de admitidos no período que já completou N dias; quem sai no próprio dia do marco não conta como retido.
        Tempos em dias corridos, contando o dia da admissão. Marcos: {r.rule.milestones.join(", ")} dias{r.rule.countAdmissionDay ? " (admissão = 1º dia)" : ""}.
      </p>
    </>
  );
}
