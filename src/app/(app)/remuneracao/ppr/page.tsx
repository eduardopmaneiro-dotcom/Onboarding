import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDate } from "@/lib/datetime";
import { pprOverview } from "@/modules/compensation/service";
import { ActionForm, CheckboxField, Field, SelectField, Submit } from "@/components/forms";
import { Badge, Card, PageHeader, TableWrap } from "@/components/ui";
import { RemTabs, brl, moneyInput } from "@/components/rem-tabs";
import { pprAction, pprGoalAction } from "../actions";

export const metadata = { title: "PPR" };
export const dynamic = "force-dynamic";

type P = Awaited<ReturnType<typeof pprOverview>>[number]["program"];

function ProgramForm({ p, units }: { p?: P; units: Array<{ id: string; name: string }> }) {
  return (
    <ActionForm action={pprAction} resetOnSuccess={!p} className="grid gap-3 sm:grid-cols-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field name="name" label="Programa" defaultValue={p?.name ?? ""} className="sm:col-span-2" />
      <Field name="periodStart" label="Início" type="date" defaultValue={p ? dateKey(p.periodStart) : ""} />
      <Field name="periodEnd" label="Fim" type="date" defaultValue={p ? dateKey(p.periodEnd) : ""} />
      <Field name="poolAmount" label="Montante com 100% das metas (R$)" inputMode="decimal" defaultValue={moneyInput(p?.poolAmount)} />
      <SelectField name="distribution" label="Distribuição" defaultValue={p?.distribution ?? "IGUAL"} options={[{ value: "IGUAL", label: "Igual entre elegíveis" }, { value: "PROPORCIONAL_SALARIO", label: "Proporcional ao salário-base" }]} />
      <Field name="minMonths" label="Meses mínimos no período" type="number" defaultValue={p?.minMonths ?? 0} />
      <SelectField name="unitId" label="Unidade" placeholder="Todas" defaultValue={p?.unitId ?? ""} options={units.map((u) => ({ value: u.id, label: u.name }))} />
      <Field name="maxAchievementPct" label="Teto de atingimento por meta (%)" type="number" defaultValue={p?.maxAchievementPct ?? 100} />
      <Field name="minFactorPct" label="Gatilho: atingimento mínimo (%)" type="number" defaultValue={p?.minFactorPct ?? 0} />
      <SelectField name="status" label="Situação" defaultValue={p?.status ?? "RASCUNHO"} options={[{ value: "RASCUNHO", label: "Rascunho / em andamento" }, { value: "APURADO", label: "Apurado" }, { value: "PAGO", label: "Pago" }]} />
      <div className="flex items-end"><CheckboxField name="prorate" label="Proporcional aos meses trabalhados" defaultChecked={p?.prorate ?? true} /></div>
      <Field name="notes" label="Regulamento / acordo (referência)" defaultValue={p?.notes ?? ""} className="sm:col-span-3" />
      <div className="flex items-end"><Submit>{p ? "Salvar programa" : "Criar programa"}</Submit></div>
    </ActionForm>
  );
}

export default async function PprPage() {
  const user = await requirePermission("remuneracao.view");
  const [programs, units] = await Promise.all([pprOverview(user), prisma.unit.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const config = can(user, "remuneracao.config") && (user.role === "ADMIN" || !user.unitId);
  return (
    <>
      <PageHeader title="Remuneração" subtitle="PPR parametrizável: montante, metas com peso e atingimento, teto, gatilho, elegibilidade e forma de distribuição." />
      <RemTabs active="/remuneracao/ppr" />
      <div className="space-y-6">
        {programs.map(({ program: p, factor, projected, pool, eligible, shares, totalMonths, missingSalary }) => (
          <Card key={p.id} title={p.name} actions={<div className="flex gap-1.5"><Badge tone={p.status === "PAGO" ? "green" : p.status === "APURADO" ? "blue" : "gold"}>{p.status.toLowerCase()}</Badge><Badge>{fmtDate(p.periodStart)} a {fmtDate(p.periodEnd)}</Badge></div>}>
            <div className="grid gap-4 sm:grid-cols-4 text-sm">
              <div><p className="text-xs text-stone-500">Montante (100% das metas)</p><p className="font-serif text-xl text-riale-900">{p.poolAmount === null ? "não informado" : brl(Number(p.poolAmount))}</p></div>
              <div><p className="text-xs text-stone-500">Atingimento ponderado</p><p className="font-serif text-xl text-riale-900">{factor.factor === null ? "não apurado" : `${((factor.pct ?? 0)).toFixed(1).replace(".", ",")}%`}</p>{factor.triggered === false && <p className="text-xs text-red-700">abaixo do gatilho ({p.minFactorPct}%) — nada a pagar</p>}{Math.abs(factor.weightSum - 100) > 0.001 && <p className="text-xs text-gold-600">pesos somam {factor.weightSum}%</p>}</div>
              <div><p className="text-xs text-stone-500">{projected ? "Montante projetado (100%)" : "Montante a distribuir"}</p><p className="font-serif text-xl text-riale-900">{brl(pool)}</p></div>
              <div><p className="text-xs text-stone-500">Elegíveis</p><p className="font-serif text-xl text-riale-900">{eligible}</p><p className="text-xs text-stone-400">CLT, {p.minMonths}+ meses{p.unitId ? ", unidade definida" : ""} · {totalMonths} meses no período</p></div>
            </div>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-stone-500"><tr><th className="py-1">Meta</th><th>Alvo</th><th className="text-right">Peso</th><th className="text-right">Atingimento</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {p.goals.map((g) => (
                  <tr key={g.id}><td className="py-1.5">{g.name}</td><td className="text-stone-500">{g.target}</td><td className="text-right tabular-nums">{Number(g.weightPct)}%</td>
                    <td className="text-right">{config && p.status !== "PAGO" ? (
                      <ActionForm action={pprGoalAction} className="inline-flex items-center gap-1"><input type="hidden" name="id" value={g.id} /><input type="hidden" name="programId" value={p.id} /><input type="hidden" name="name" value={g.name} /><input type="hidden" name="weightPct" value={String(g.weightPct)} /><input type="hidden" name="target" value={g.target ?? ""} />
                        <input name="achievementPct" defaultValue={g.achievementPct === null ? "" : String(g.achievementPct)} placeholder="—" className="input w-20 py-1 text-right text-xs" aria-label={`Atingimento — ${g.name}`} /><span className="text-xs">%</span><Submit className="btn-ghost btn-sm" pendingText="…">ok</Submit></ActionForm>
                    ) : g.achievementPct === null ? "—" : `${Number(g.achievementPct)}%`}</td></tr>
                ))}
              </tbody>
            </table>
            {config && p.status !== "PAGO" && (
              <ActionForm action={pprGoalAction} resetOnSuccess className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_auto] sm:items-end">
                <input type="hidden" name="programId" value={p.id} />
                <Field name="name" label="Nova meta" /><Field name="target" label="Alvo" /><Field name="weightPct" label="Peso (%)" inputMode="decimal" />
                <Submit className="btn-ghost btn-sm">Adicionar meta</Submit>
              </ActionForm>
            )}
            {missingSalary.length > 0 && <p className="mt-2 text-xs text-gold-600">{missingSalary.length} elegível(is) sem salário-base — ficam com peso zero na distribuição proporcional.</p>}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-riale-900">Distribuição por colaborador ({shares.length} no seu escopo){projected ? " — projeção a 100% das metas" : ""}</summary>
              <TableWrap>
                <table className="mt-2 w-full text-sm"><thead className="bg-riale-50 text-left text-[11px] uppercase text-stone-500"><tr><th className="px-5 py-1.5">Colaborador</th><th className="px-3">Unidade</th><th className="px-3 text-right">Meses</th><th className="px-5 text-right">Valor</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">{shares.map((s) => <tr key={s.id}><td className="px-5 py-1.5">{s.name}</td><td className="px-3">{s.unit}</td><td className="px-3 text-right tabular-nums">{s.months}</td><td className="px-5 text-right tabular-nums">{brl(s.share)}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            </details>
            {config && <details className="mt-4"><summary className="cursor-pointer text-xs font-medium text-gold-600">Editar parâmetros</summary><div className="mt-3"><ProgramForm p={p} units={units} /></div></details>}
          </Card>
        ))}
        {programs.length === 0 && <Card><p className="text-sm text-stone-500">Nenhum programa de PPR cadastrado.</p></Card>}
        {config && <Card title="Novo programa de PPR"><ProgramForm units={units} /></Card>}
      </div>
    </>
  );
}
