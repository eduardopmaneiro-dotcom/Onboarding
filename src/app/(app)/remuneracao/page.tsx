import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { todayKey } from "@/lib/datetime";
import { competenceReport } from "@/modules/compensation/service";
import { isCompetence, shiftCompetence } from "@/modules/compensation/calc";
import { MONTHS } from "@/lib/datetime";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { RemTabs, brl } from "@/components/rem-tabs";

export const metadata = { title: "Remuneração" };
export const dynamic = "force-dynamic";

const compLabel = (c: string) => `${MONTHS[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;

function Tile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${strong ? "border-gold-400 bg-gold-100/40" : "border-stone-200 bg-white"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="font-serif text-xl font-semibold tabular-nums text-riale-900">{value}</p>
      {hint && <p className="text-[10px] text-stone-400">{hint}</p>}
    </div>
  );
}

export default async function CompensationPage({ searchParams }: { searchParams: Promise<{ c?: string; unidade?: string; cargo?: string }> }) {
  const user = await requirePermission("remuneracao.view");
  const sp = await searchParams;
  const c = isCompetence(sp.c) ? sp.c : todayKey().slice(0, 7);
  const [r, units, positions] = await Promise.all([
    competenceReport(user, c, { unidade: sp.unidade, cargo: sp.cargo }),
    prisma.unit.findMany({ where: { active: true, ...(user.role === "RH" && user.unitId ? { id: user.unitId } : {}) }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);
  const t = r.totals;
  const qs = (p: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ ...sp, c, ...p }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Remuneração" subtitle="Salário-base, adicionais, variáveis, premiações, benefícios, encargos e custo total — sempre separados." />
      <RemTabs active="/remuneracao" />
      <form className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <Link href={qs({ c: shiftCompetence(c, -1) })} className="btn-ghost btn-sm" aria-label="Competência anterior">‹</Link>
        <input type="month" name="c" defaultValue={c} className="input w-auto py-1.5 text-sm" aria-label="Competência" />
        <Link href={qs({ c: shiftCompetence(c, 1) })} className="btn-ghost btn-sm" aria-label="Próxima competência">›</Link>
        <select name="unidade" defaultValue={sp.unidade ?? ""} className="input w-auto py-1.5 text-sm" aria-label="Unidade"><option value="">Todas as unidades</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select name="cargo" defaultValue={sp.cargo ?? ""} className="input w-auto max-w-56 py-1.5 text-sm" aria-label="Cargo"><option value="">Todos os cargos</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <button className="btn-primary btn-sm">Aplicar</button>
        <span className="ml-auto font-serif text-lg text-riale-900 first-letter:uppercase">{compLabel(c)}</span>
      </form>

      <Card title={`Composição da folha — ${t.n} colaborador(es)`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Tile label="Salário-base" value={brl(t.base)} hint="pago na competência, ou contratual quando não lançado" />
          <Tile label="Adicionais" value={brl(t.adicionais)} />
          <Tile label="Variáveis" value={brl(t.variaveis)} />
          <Tile label="Premiações" value={brl(t.premiacoes)} hint="inclui Elogio Premiado" />
          <Tile label="PPR (provisão)" value={brl(t.ppr)} hint="parcela mensal do programa" />
          <Tile label="Remuneração em dinheiro" value={brl(t.dinheiro)} strong />
          <Tile label="Benefícios" value={brl(t.beneficios)} hint="custo líquido da empresa" />
          <Tile label="Remuneração total" value={brl(t.total)} strong hint="dinheiro + benefícios" />
          <Tile label="Encargos estimados" value={t.noRates ? "sem parâmetros" : brl(t.encargos)} hint={t.noRates ? "cadastre as alíquotas em Encargos" : "alíquotas cadastradas"} />
          <Tile label="Custo total estimado" value={brl(t.custo)} strong hint={t.partial ? `${t.partial} colaborador(es) com dado faltante` : "completo"} />
        </div>
        {t.partial > 0 && <p className="mt-3 text-xs text-gold-600">Custo parcial: {t.partial} colaborador(es) com valores não cadastrados (veja “pendências”). Nada foi estimado sem parâmetro da empresa.</p>}
      </Card>

      <Card className="mt-6">
        {r.rows.length === 0 ? <Empty>Nenhum colaborador ativo na competência.</Empty> : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="bg-riale-50 text-right text-[11px] uppercase tracking-wide text-stone-500">
                <tr><th className="px-5 py-2 text-left">Colaborador</th><th className="px-2 py-2">Salário-base</th><th className="px-2 py-2">Tabela do cargo</th><th className="px-2 py-2">Adicionais</th><th className="px-2 py-2">Variáveis</th><th className="px-2 py-2">Premiações</th><th className="px-2 py-2">PPR</th><th className="px-2 py-2">Benefícios</th><th className="px-2 py-2">Encargos</th><th className="px-5 py-2">Custo total</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-right tabular-nums">
                {r.rows.map((x) => {
                  const base = x.comp.basePaid ?? x.comp.base;
                  const diff = x.comp.base !== null && x.tableRef ? ((x.comp.base - x.tableRef.value) / x.tableRef.value) * 100 : null;
                  return (
                    <tr key={x.id} className="hover:bg-riale-50/50" data-employee={x.name}>
                      <td className="px-5 py-2 text-left"><Link href={`/remuneracao/colaborador/${x.id}?c=${c}`} className="font-medium text-riale-900 hover:underline">{x.name}</Link><span className="block text-xs text-stone-400">{x.positionTitle} · {x.unitName}{x.contractType !== "CLT" ? ` · ${x.contractType}` : ""}</span>{x.comp.partial.length > 0 && <span title={x.comp.partial.join("\n")}><Badge tone="gold">{x.comp.partial.length} pendência(s)</Badge></span>}</td>
                      <td className="px-2 py-2">{brl(base)}{x.comp.basePaid !== null && <span className="block text-[10px] text-stone-400">contratual {brl(x.comp.base)}</span>}</td>
                      <td className="px-2 py-2 text-stone-500">{x.tableRef ? brl(x.tableRef.value) : "—"}{diff !== null && Math.abs(diff) >= 0.05 && <span className={`block text-[10px] ${diff < 0 ? "text-red-700" : "text-emerald-700"}`}>{diff > 0 ? "+" : ""}{diff.toFixed(1).replace(".", ",")}%</span>}</td>
                      <td className="px-2 py-2">{brl(x.comp.adicionais)}</td>
                      <td className="px-2 py-2">{brl(x.comp.variaveis)}</td>
                      <td className="px-2 py-2">{brl(x.comp.premiacoes + (x.comp.elogio?.value ?? 0))}</td>
                      <td className="px-2 py-2">{x.comp.ppr ? <>{brl(x.comp.ppr.monthly)}{x.comp.ppr.projected && <span className="block text-[10px] text-stone-400">projeção</span>}</> : "—"}</td>
                      <td className="px-2 py-2">{brl(x.comp.beneficios.net)}</td>
                      <td className="px-2 py-2">{x.comp.encargos.total === null ? <span className="text-xs text-stone-400">sem parâmetros</span> : brl(x.comp.encargos.total)}</td>
                      <td className="px-5 py-2 font-medium text-riale-900">{brl(x.comp.custoTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <p className="mt-4 text-xs text-stone-400">
        Salário-base é o valor do contrato (ou o efetivamente pago, quando lançado). Remuneração em dinheiro = salário + adicionais + variáveis + premiações + Elogio Premiado + provisão do PPR.
        Remuneração total = em dinheiro + benefícios (custo líquido da empresa). Custo total = remuneração total + encargos estimados sobre as rubricas com incidência (prêmios, Elogio Premiado e PPR não têm incidência).
        Benefícios contam o mês inteiro quando ativos em qualquer dia da competência.
      </p>
    </>
  );
}
