import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { fmtDate, todayKey } from "@/lib/datetime";
import { GRAN_LABEL, shiftPeriod, type Granularity } from "@/modules/analytics/periods";
import { buildSurvey, type Stats, type SurveyQuery } from "@/modules/compensation/market";
import { HOTEL_CATEGORIES, MARKET_SOURCE_LABEL } from "@/modules/compensation/constants";
import { BarList } from "@/components/charts";
import { ActionForm, Field, SelectField, Submit } from "@/components/forms";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { brl } from "@/components/rem-tabs";
import { deleteMarketAction, marketAction } from "./actions";

export const metadata = { title: "Pesquisa salarial" };
export const dynamic = "force-dynamic";

const pctTxt = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
function S({ s, show = "median" }: { s: Stats; show?: "median" | "mean" }) {
  if (!s.n) return <span className="text-stone-300">—</span>;
  return <>{brl(show === "median" ? s.median : s.mean)}<span className="block text-[10px] text-stone-400">n = {s.n}</span></>;
}
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p><p className="font-serif text-xl font-semibold tabular-nums text-riale-900">{value}</p>{hint && <p className="text-[10px] text-stone-400">{hint}</p>}</div>;
}

export default async function SurveyPage({ searchParams }: { searchParams: Promise<SurveyQuery> }) {
  const user = await requirePermission("pesquisa_salarial.view");
  const sp = await searchParams;
  const r = await buildSurvey(user, sp);
  const positions = await prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  const manage = can(user, "pesquisa_salarial.manage");
  const o = r.overall;
  const qs = (p: Partial<SurveyQuery>) => "?" + new URLSearchParams(Object.entries({ ...sp, gran: r.period.gran, ref: r.period.from, ...p }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Pesquisa salarial" subtitle={`${r.period.label} · pretensão, oferta e último salário das entrevistas; salário praticado; mercado. Salário-base e remuneração total em colunas separadas.`} />
      <form className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-xs">{(Object.keys(GRAN_LABEL) as Granularity[]).map((g) => <Link key={g} href={qs({ gran: g })} className={`px-3 py-1.5 ${r.period.gran === g ? "bg-riale-800 text-white" : "text-stone-600 hover:bg-riale-50"}`}>{GRAN_LABEL[g]}</Link>)}</div>
        <Link href={qs({ ref: shiftPeriod(r.period, -1).from })} className="btn-ghost btn-sm" aria-label="Período anterior">‹</Link>
        <span className="min-w-32 text-center font-serif text-lg text-riale-900 first-letter:uppercase">{r.period.label}</span>
        <Link href={qs({ ref: shiftPeriod(r.period, 1).from })} className="btn-ghost btn-sm" aria-label="Próximo período">›</Link>
        <input type="hidden" name="gran" value={r.period.gran} /><input type="hidden" name="ref" value={r.period.from} />
        <select name="unidade" defaultValue={sp.unidade ?? ""} className="input w-auto py-1.5 text-xs" aria-label="Unidade"><option value="">Unidade: todas</option>{r.options.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select name="cargo" defaultValue={sp.cargo ?? ""} className="input w-auto max-w-56 py-1.5 text-xs" aria-label="Cargo"><option value="">Cargo: todos</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <button className="btn-primary btn-sm">Aplicar</button>
      </form>

      <Card title={`Entrevistas do período — ${r.appsInPeriod} candidatura(s)`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Tile label="Pretensão média" value={brl(o.expected.mean)} hint={`n = ${o.expected.n}`} />
          <Tile label="Pretensão mediana" value={brl(o.expected.median)} hint={`n = ${o.expected.n}`} />
          <Tile label="Oferta mediana" value={brl(o.offered.median)} hint={`n = ${o.offered.n}`} />
          <Tile label="Último salário (mediana)" value={brl(o.last.median)} hint={`n = ${o.last.n}`} />
          <Tile label="Pretensão − oferta" value={brl(o.gap.meanDiff)} hint={o.gap.n ? `média; ${o.gap.meanPct?.toFixed(1).replace(".", ",")}% · n = ${o.gap.n} pares` : "sem pares"} />
          <Tile label="Pretensão acima da oferta" value={o.gap.n ? `${o.gap.aboveOffer} de ${o.gap.n}` : "—"} />
        </div>
        <p className="mt-2 text-[11px] text-stone-400">A diferença só usa candidaturas com pretensão e oferta registradas (pares). Período pela data da 1ª entrevista da candidatura.</p>
      </Card>

      <Card title="Por cargo — salário-base" className="mt-6">
        {r.rows.length === 0 ? <Empty>Sem dados.</Empty> : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="bg-riale-50 text-right text-[11px] uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2 text-left">Cargo</th><th className="px-2">Pretensão (mediana)</th><th className="px-2">Pretensão (média)</th><th className="px-2">Oferta (mediana)</th><th className="px-2">Pretensão − oferta</th><th className="px-2">Último salário</th><th className="px-2">Praticado (ativos)</th><th className="px-2">Tabela</th><th className="px-2">Mercado — base</th><th className="px-5">Mercado — total*</th></tr></thead>
              <tbody className="divide-y divide-stone-100 text-right tabular-nums">
                {r.rows.map((x) => (
                  <tr key={x.positionId} data-position={x.title}>
                    <td className="px-5 py-2 text-left">{x.title}</td>
                    <td className="px-2 py-2"><S s={x.expected} /></td><td className="px-2 py-2"><S s={x.expected} show="mean" /></td><td className="px-2 py-2"><S s={x.offered} /></td>
                    <td className="px-2 py-2">{x.gap.n ? <>{brl(x.gap.meanDiff)}<span className="block text-[10px] text-stone-400">{x.gap.meanPct?.toFixed(1).replace(".", ",")}% · n = {x.gap.n}</span></> : <span className="text-stone-300">—</span>}</td>
                    <td className="px-2 py-2"><S s={x.last} /></td>
                    <td className="px-2 py-2">{x.practiced.n ? <>{brl(x.practiced.median)}<span className="block text-[10px] text-stone-400">{brl(x.practiced.min)}–{brl(x.practiced.max)} · n = {x.practiced.n}</span></> : <span className="text-stone-300">—</span>}</td>
                    <td className="px-2 py-2">{brl(x.table)}</td>
                    <td className="px-2 py-2"><S s={x.marketBase} /></td><td className="px-5 py-2 text-stone-500"><S s={x.marketTotal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-2 text-[11px] text-stone-400">*Remuneração total informada pelo mercado (inclui variáveis/benefícios) — não comparar com salário-base. Praticado = salário-base vigente dos colaboradores ativos.</p>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Motivos de recusa pelo candidato"><BarList rows={r.declines} valueLabel="ocorrências" emptyText="Nenhuma desistência no período." /></Card>
        <Card title="Motivos de reprovação (RH e gestor)"><BarList rows={r.rejections} valueLabel="ocorrências" emptyText="Nenhuma reprovação no período." /></Card>
        <Card title={`Benefícios mais valorizados (${r.appsWithBenefits} candidatura(s) informaram)`}><BarList rows={r.benefits} valueLabel="menções" emptyText="Nenhum benefício informado." /></Card>
      </div>

      <Card title="Cargos com maior dificuldade de contratação" className="mt-6">
        {r.difficulty.length === 0 ? <Empty>Sem vagas no período.</Empty> : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="bg-riale-50 text-right text-[11px] uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2 text-left">Cargo</th><th className="px-2">Vagas abertas</th><th className="px-2">Vaga mais antiga (dias)</th><th className="px-2">Dias até contratar (mediana)</th><th className="px-2">Contratações</th><th className="px-2">Entrevistados por contratação</th><th className="px-2">Desistência</th><th className="px-5">Pretensão &gt; oferta</th></tr></thead>
              <tbody className="divide-y divide-stone-100 text-right tabular-nums">
                {r.difficulty.map((x) => { const d = x.difficulty; return (
                  <tr key={x.positionId}><td className="px-5 py-2 text-left">{x.title}</td><td className="px-2">{d.openNow}</td><td className="px-2">{d.oldestOpenDays ?? "—"}</td><td className="px-2">{d.medianFillDays === null ? "—" : String(d.medianFillDays).replace(".", ",")}</td><td className="px-2">{d.hires}</td><td className="px-2">{d.interviewedPerHire === null ? (d.interviewed ? `${d.interviewed} sem contratação` : "—") : String(d.interviewedPerHire).replace(".", ",")}</td><td className="px-2">{pctTxt(d.withdrawalRate)}</td><td className="px-5">{pctTxt(d.aboveOfferRate)}</td></tr>
                ); })}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-2 text-[11px] text-stone-400">Ordenado pelo maior entre “dias até contratar (mediana)” e “idade da vaga aberta mais antiga”; empate pela taxa de desistência. Os demais sinais ficam lado a lado — não há índice com pesos arbitrários.</p>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={`Mercado — concorrentes e outros hotéis do Rio (${r.market.length})`}>
          {r.market.length === 0 ? <Empty>Nenhum registro de mercado.</Empty> : (
            <ul className="divide-y divide-stone-100 text-sm">
              {r.market.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium text-riale-900">{m.companyName}</span> · {m.position.title}<span className="block text-xs text-stone-500">{[m.hotelCategory, m.region, MARKET_SOURCE_LABEL[m.source], fmtDate(m.collectedAt), m.reference].filter(Boolean).join(" · ")}{m.benefits.length ? ` · benefícios: ${m.benefits.join(", ")}` : ""}</span></span>
                  <span className="flex items-center gap-3 text-right tabular-nums"><span>base {brl(m.baseSalary === null ? null : Number(m.baseSalary))}<span className="block text-xs text-stone-500">total {brl(m.totalComp === null ? null : Number(m.totalComp))}</span></span>{manage && <ActionForm action={deleteMarketAction}><input type="hidden" name="id" value={m.id} /><Submit className="text-xs text-stone-400 hover:text-red-700" pendingText="…">excluir</Submit></ActionForm>}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {manage && (
          <Card title="Registrar dado de mercado">
            <ActionForm action={marketAction} resetOnSuccess className="space-y-3">
              <SelectField name="positionId" label="Cargo (catálogo)" placeholder="Escolha…" options={positions.map((p) => ({ value: p.id, label: p.title }))} />
              <Field name="companyName" label="Hotel / empresa" />
              <div className="grid grid-cols-2 gap-2"><SelectField name="hotelCategory" label="Categoria" placeholder="—" options={HOTEL_CATEGORIES.map((c) => ({ value: c, label: c }))} /><Field name="region" label="Bairro / região" placeholder="Copacabana" /></div>
              <SelectField name="source" label="Fonte" options={Object.entries(MARKET_SOURCE_LABEL).map(([value, label]) => ({ value, label }))} />
              <div className="grid grid-cols-2 gap-2"><Field name="baseSalary" label="Salário-base (R$)" inputMode="decimal" /><Field name="totalComp" label="Remuneração total (R$)" inputMode="decimal" /></div>
              <Field name="benefits" label="Benefícios oferecidos (vírgulas)" />
              <Field name="collectedAt" label="Data da coleta" type="date" defaultValue={todayKey()} />
              <Field name="reference" label="Referência (link, documento, contato)" />
              <Submit>Salvar</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
