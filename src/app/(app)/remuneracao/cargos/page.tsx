import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDate, todayKey } from "@/lib/datetime";
import { listPositionTable } from "@/modules/compensation/service";
import { ActionForm, Field, SelectField, Submit } from "@/components/forms";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { RemTabs, brl } from "@/components/rem-tabs";
import { positionSalaryAction } from "../actions";

export const metadata = { title: "Tabela salarial por cargo" };
export const dynamic = "force-dynamic";

export default async function PositionTablePage() {
  const user = await requirePermission("remuneracao.view");
  const [rows, positions, units] = await Promise.all([
    listPositionTable(user),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const today = todayKey();
  const current = new Set<string>();
  for (const r of rows) { const k = `${r.positionId}|${r.unitId ?? ""}`; if (dateKey(r.effectiveFrom) <= today && !current.has(k)) current.add(`${k}|${r.id}`); }
  const isCurrent = (r: (typeof rows)[number]) => current.has(`${r.positionId}|${r.unitId ?? ""}|${r.id}`);
  const config = can(user, "remuneracao.config") && (user.role === "ADMIN" || !user.unitId);
  return (
    <>
      <PageHeader title="Remuneração" subtitle="Plano de cargos e salários: faixa por cargo (mínimo, referência e máximo), com vigência. A faixa da unidade prevalece sobre a geral." />
      <RemTabs active="/remuneracao/cargos" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          {rows.length === 0 ? <Empty>Nenhum salário-base cadastrado por cargo.</Empty> : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-riale-50 text-left text-[11px] uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2">Cargo</th><th className="px-3 py-2">Unidade</th><th className="px-3 py-2">Vigência</th><th className="px-3 py-2 text-right">Mínimo</th><th className="px-3 py-2 text-right">Referência</th><th className="px-3 py-2 text-right">Máximo</th><th className="px-5 py-2">Observação</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((r) => (
                    <tr key={r.id} className={isCurrent(r) ? "" : "text-stone-400"}>
                      <td className="px-5 py-2">{r.position.title}</td><td className="px-3 py-2">{r.unit?.name ?? "Todas"}</td>
                      <td className="px-3 py-2">{fmtDate(r.effectiveFrom)}{isCurrent(r) ? <span className="ml-1 text-[10px] font-medium text-emerald-700">vigente</span> : dateKey(r.effectiveFrom) > today ? <span className="ml-1 text-[10px]">futura</span> : null}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.minSalary ? brl(Number(r.minSalary)) : "—"}</td><td className="px-3 py-2 text-right tabular-nums font-medium">{brl(Number(r.baseSalary))}</td><td className="px-3 py-2 text-right tabular-nums">{r.maxSalary ? brl(Number(r.maxSalary)) : "—"}</td><td className="px-5 py-2 text-xs">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
        {config && (
          <Card title="Nova vigência">
            <ActionForm action={positionSalaryAction} resetOnSuccess className="space-y-3">
              <SelectField name="positionId" label="Cargo" placeholder="Escolha…" options={positions.map((p) => ({ value: p.id, label: p.title }))} />
              <SelectField name="unitId" label="Unidade" placeholder="Todas as unidades" options={units.map((u) => ({ value: u.id, label: u.name }))} />
              <Field name="minSalary" label="Salário mínimo da faixa (R$, opcional)" inputMode="decimal" />
              <Field name="baseSalary" label="Salário de referência (R$)" inputMode="decimal" />
              <Field name="maxSalary" label="Salário máximo da faixa (R$, opcional)" inputMode="decimal" />
              <Field name="effectiveFrom" label="Vigência a partir de" type="date" defaultValue={today} />
              <Field name="note" label="Origem / observação" placeholder="Ex.: convenção coletiva 2026" />
              <Submit>Salvar</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
