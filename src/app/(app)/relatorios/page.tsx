import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/datetime";
import { buildReport, filterSummary, type ReportQuery } from "@/modules/analytics/report";
import { shiftPeriod, GRAN_LABEL, type Granularity } from "@/modules/analytics/periods";
import { BarList, ColumnTrend, RateTile, SlaBar, fmtDays, pct } from "@/components/charts";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Relatórios — indicadores de RH" };
export const dynamic = "force-dynamic";

function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="font-serif text-2xl font-semibold tabular-nums text-riale-900">{value}</p>
      {hint && <p className="text-[10px] text-stone-400">{hint}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportQuery> }) {
  const user = await requirePermission("relatorios.view");
  const sp = await searchParams;
  const r = await buildReport(user, sp);
  const c = r.counts;
  const qs = (p: Partial<ReportQuery>) => "?" + new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const prev = shiftPeriod(r.period, -1), next = shiftPeriod(r.period, 1);
  const exportQs = new URLSearchParams(Object.entries({ ...sp, gran: r.period.gran, ref: r.period.from }).filter(([, v]) => v) as [string, string][]).toString();
  const sel = (name: keyof ReportQuery, label: string, opts: Array<{ value: string; label: string }>) => (
    <select name={name} defaultValue={sp[name] ?? ""} className="input w-auto max-w-48 py-1.5 text-xs" aria-label={label}>
      <option value="">{label}: todos</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader
        title="Indicadores de RH"
        subtitle={`${filterSummary(r)} · dados reais do banco, atualizados em ${fmtDateTime(r.generatedAt)}`}
        actions={(
          <>
            <Link href={`/relatorios/permanencia?gran=${r.period.gran}&ref=${r.period.from}`} className="btn-ghost">Permanência e turnover</Link>
            {can(user, "relatorios.exportar") && <a href={`/api/v1/reports/xlsx?${exportQs}`} className="btn-ghost">Exportar Excel</a>}
            {can(user, "relatorios.exportar") && <a href={`/api/v1/reports/pdf?${exportQs}`} className="btn-ghost">Exportar PDF</a>}
          </>
        )}
      />

      {/* Filtros — uma linha acima dos gráficos */}
      <form className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-xs">
          {(Object.keys(GRAN_LABEL) as Granularity[]).map((g) => (
            <Link key={g} href={qs({ gran: g })} className={`px-3 py-1.5 ${r.period.gran === g ? "bg-riale-800 text-white" : "text-stone-600 hover:bg-riale-50"}`}>{GRAN_LABEL[g]}</Link>
          ))}
        </div>
        <Link href={qs({ ref: prev.from })} className="btn-ghost btn-sm" aria-label="Período anterior">‹</Link>
        <span className="min-w-36 text-center font-serif text-lg text-riale-900 first-letter:uppercase">{r.period.label}</span>
        <Link href={qs({ ref: next.from })} className="btn-ghost btn-sm" aria-label="Próximo período">›</Link>
        <input type="hidden" name="gran" value={r.period.gran} />
        <input type="hidden" name="ref" value={r.period.from} />
        <span className="mx-1 h-6 w-px bg-stone-200" />
        {sel("unidade", "Unidade", r.options.units)}
        {sel("departamento", "Departamento", r.options.departments)}
        {sel("cargo", "Cargo", r.options.positions)}
        {sel("recrutadora", "Recrutadora", r.options.recruiters)}
        {sel("gestor", "Gestor", r.options.managers)}
        <button className="btn-primary btn-sm">Aplicar</button>
        <Link href={`?gran=${r.period.gran}&ref=${r.period.from}`} className="text-xs text-stone-500 hover:underline">limpar</Link>
      </form>

      {/* 1. Recrutamento */}
      <Card title="Recrutamento no período">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          <Kpi label="Vagas abertas" value={c.vagasAbertasAgora} hint={`agora · ${c.vagasAbertasNoPeriodo} abertas no período`} />
          <Kpi label="Vagas encerradas" value={c.vagasEncerradas} hint="no período" />
          <Kpi label="Candidatos cadastrados" value={c.candidatosCadastrados} />
          <Kpi label="Entrevistas agendadas" value={c.entrevistasAgendadas} hint={c.semResultado ? `${c.semResultado} passadas sem resultado` : undefined} />
          <Kpi label="Entrevistas realizadas" value={c.entrevistasRealizadas} />
          <Kpi label="Faltas" value={c.faltas} />
          <Kpi label="Desistências" value={c.desistencias} />
          <Kpi label="Contratações" value={c.contratacoes} />
          <Kpi label="Aprovações do RH" value={c.aprovacoesRH} />
          <Kpi label="Reprovações do RH" value={c.reprovacoesRH} />
          <Kpi label="Aprovações dos gestores" value={c.aprovacoesGestor} />
          <Kpi label="Reprovações dos gestores" value={c.reprovacoesGestor} hint={c.novaEntrevistaGestor ? `+${c.novaEntrevistaGestor} nova(s) entrevista(s)` : undefined} />
          <Kpi label="Aguardando gestor" value={c.pendentesGestorAgora} hint="agora" />
        </div>
      </Card>

      {/* 2. Conversão */}
      <h2 className="mt-8 mb-3 font-serif text-xl text-riale-900">Conversão</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <RateTile title="Comparecimento" r={r.conversion.comparecimento} />
        <RateTile title="Aprovação do RH" r={r.conversion.aprovacaoRH} />
        <RateTile title="Aprovação dos gestores" r={r.conversion.aprovacaoGestor} />
        <RateTile title="Conversão em contratação" r={r.conversion.contratacao} />
        <RateTile title="Desistência" r={r.conversion.desistencia} />
      </div>
      {r.conversion.contratacao.excluded && Object.values(r.conversion.contratacao.excluded)[0] > 0 && (
        <p className="mt-2 text-xs text-gold-600">Atenção: {Object.values(r.conversion.contratacao.excluded)[0]} candidatura(s) desta coorte ainda estão em processo — a taxa de contratação do período ainda vai subir.</p>
      )}

      {/* Tendência */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title={`Entrevistas agendadas por ${GRAN_LABEL[r.period.gran].toLowerCase()} (últimos ${r.trend.length})`}>
          <ColumnTrend data={r.trend.map((t) => ({ key: t.key, label: t.label, value: t.agendadas }))} measure="entrevistas" label="Entrevistas agendadas (exceto canceladas)" />
        </Card>
        <Card title={`Contratações por ${GRAN_LABEL[r.period.gran].toLowerCase()} (últimos ${r.trend.length})`}>
          <ColumnTrend data={r.trend.map((t) => ({ key: t.key, label: t.label, value: t.contratacoes }))} measure="contratações" label="Admissões registradas" />
        </Card>
      </div>

      {/* 3. Produtividade */}
      <h2 className="mt-8 mb-3 font-serif text-xl text-riale-900">Produtividade</h2>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Entrevistas por recrutadora"><BarList valueLabel="entrevistas" rows={r.byRecruiter.map((x) => ({ label: x.label, value: x.agendadas, hint: `${x.realizadas} realiz. · ${x.aprovadasRH} aprov.` }))} /></Card>
        <Card title="Contratações por recrutadora"><BarList valueLabel="contratações" rows={r.hiresByRecruiter} emptyText="Nenhuma admissão registrada no período." /></Card>
        <Card title="Entrevistas por unidade"><BarList valueLabel="entrevistas" rows={r.byUnit.map((x) => ({ label: x.label, value: x.agendadas, hint: `${x.faltas} faltas` }))} /></Card>
        <Card title="Entrevistas por departamento"><BarList valueLabel="entrevistas" rows={r.byDepartment.map((x) => ({ label: x.label, value: x.agendadas, hint: `${x.aprovadasRH} aprov.` }))} /></Card>
        <Card title="Entrevistas por cargo"><BarList valueLabel="entrevistas" rows={r.byPosition.slice(0, 15).map((x) => ({ label: x.label, value: x.agendadas, hint: `${x.aprovadasRH} aprov.` }))} /></Card>
        <Card title="Motivos de reprovação do RH"><BarList valueLabel="reprovações" rows={r.reasons} emptyText="Sem reprovações no período." /></Card>
      </div>

      <Card title="Tempo de avaliação dos gestores (encaminhamento do RH → decisão)" className="mt-6">
        {r.managerTime.length === 0 ? <p className="py-4 text-center text-sm text-stone-400">Sem avaliações no período.</p> : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Gestor</th><th className="text-right">Decisões</th><th className="text-right">Tempo médio</th><th className="text-right">Mediana</th><th className="text-right">Pendentes agora</th><th className="text-right">Mais antiga</th></tr></thead>
              <tbody>
                {r.managerTime.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}{m.onBehalf > 0 && <p className="text-[11px] text-stone-400">{m.onBehalf} registrada(s) pelo RH em nome do gestor</p>}</td>
                    <td className="text-right tabular-nums">{m.n}</td>
                    <td className="text-right tabular-nums">{fmtDays(m.mean)}</td>
                    <td className="text-right tabular-nums">{fmtDays(m.median)}</td>
                    <td className="text-right tabular-nums">{m.pending}</td>
                    <td className="text-right tabular-nums">{fmtDays(m.oldestPendingDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 4. SLA */}
      <div className="mt-8 mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-serif text-xl text-riale-900">SLA do processo</h2>
          <p className="text-xs text-stone-500">Cada etapa tem um responsável e é medida separadamente — o tempo do gestor nunca é somado ao do RH. Dias corridos. Medições do período pela data de conclusão da etapa; histórico importado fica de fora (não tem horário nem abertura real).</p>
        </div>
        {can(user, "relatorios.metas") && <Link href="/relatorios/metas" className="btn-ghost btn-sm">Configurar metas</Link>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {r.sla.map((s) => (
          <Card key={s.stage} title={s.label} actions={<Badge tone={s.owner === "Gestor" ? "gold" : s.owner === "Ponta a ponta" ? "gray" : "blue"}>{s.owner === "Ponta a ponta" ? "Ponta a ponta (resultado)" : `Responsável: ${s.owner}`}</Badge>}>
            <SlaBar mean={s.mean} target={s.targets.length === 1 ? (s.targets[0] as number) : null} />
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div><dt className="text-stone-500">Medições</dt><dd className="font-semibold text-riale-900">{s.n}</dd></div>
              <div><dt className="text-stone-500">Mediana</dt><dd className="font-semibold text-riale-900">{fmtDays(s.median)}</dd></div>
              <div><dt className="text-stone-500">Máximo</dt><dd className="font-semibold text-riale-900">{fmtDays(s.max)}</dd></div>
              <div><dt className="text-stone-500">Na meta</dt><dd className="font-semibold text-riale-900">{pct(s.withinTarget)}<span className="block font-normal text-stone-400">{s.withinTarget.den ? `${s.withinTarget.num}/${s.withinTarget.den}` : "sem meta"}</span></dd></div>
            </dl>
            {s.targets.length > 1 && <p className="mt-2 text-[11px] text-stone-500">Metas diferentes por cargo/departamento: {s.targets.map((t) => fmtDays(t as number)).join(", ")}.</p>}
            <p className="mt-2 text-[11px] text-stone-400">De {s.from} até {s.to}.</p>
            {s.openNow.length > 0 && (
              <details className="mt-3 rounded-lg bg-riale-50 p-2 text-xs">
                <summary className="cursor-pointer font-medium text-riale-900">{s.openNow.length} em aberto agora{s.openLate ? ` · ${s.openLate} já acima da meta` : ""}</summary>
                <ul className="mt-1 space-y-0.5">{s.openNow.slice(0, 8).map((o) => <li key={o.label} className="flex justify-between gap-2"><span className="truncate">{o.label}</span><span className={o.target !== null && o.days > o.target ? "font-medium text-red-700" : ""}>{fmtDays(o.days)}{o.target !== null && o.days > o.target ? " ▲" : ""}</span></li>)}</ul>
              </details>
            )}
            {s.worst.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-stone-500">Maiores tempos no período</summary>
                <ul className="mt-1 space-y-0.5">{s.worst.map((w) => <li key={w.ref + w.stage} className="flex justify-between gap-2"><span className="truncate">{w.label}</span><span>{fmtDays(w.days)}{w.target !== null ? ` / meta ${fmtDays(w.target)}` : ""}</span></li>)}</ul>
              </details>
            )}
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-stone-400">
        Fonte: banco de dados da plataforma. {r.base.historicalInScope ? `${r.base.historicalInScope} candidatura(s) do histórico importado da planilha entram nas contagens e taxas (pela data da entrevista), não nos SLAs.` : ""} Regras de cálculo completas na aba “Metodologia” do Excel.
      </p>
    </>
  );
}
