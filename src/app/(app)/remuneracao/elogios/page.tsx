import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDate, todayKey } from "@/lib/datetime";
import { listElogios, ruleAt } from "@/modules/compensation/service";
import { elogioPremium } from "@/modules/compensation/calc";
import { employeeScopeWhere } from "@/modules/people/scope";
import { ActionForm, Field, SelectField, Submit } from "@/components/forms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { RemTabs, brl } from "@/components/rem-tabs";
import { decideElogioAction, elogioAction, elogioRuleAction } from "../actions";

export const metadata = { title: "Elogio Premiado" };
export const dynamic = "force-dynamic";

export default async function ElogiosPage() {
  const user = await requirePermission("remuneracao.view");
  const today = todayKey();
  const [rule, rules, elogios, emps] = await Promise.all([
    ruleAt(today),
    prisma.elogioRule.findMany({ orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 10 }),
    listElogios(user),
    prisma.employee.findMany({ where: { ...employeeScopeWhere(user), status: { not: "DESLIGADO" } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  const manage = can(user, "remuneracao.manage");
  const config = can(user, "remuneracao.config") && (user.role === "ADMIN" || !user.unitId);
  // prévia do mês corrente por colaborador
  const month = today.slice(0, 7);
  const byEmp = new Map<string, { name: string; list: Array<{ source: string }> }>();
  for (const e of elogios.filter((x) => x.status === "APROVADO" && dateKey(x.date).slice(0, 7) === month)) {
    const cur = byEmp.get(e.employeeId) ?? { name: e.employee.fullName, list: [] };
    cur.list.push({ source: e.source });
    byEmp.set(e.employeeId, cur);
  }

  return (
    <>
      <PageHeader title="Remuneração" subtitle="Elogio Premiado: elogios aprovados geram prêmio pela regra vigente (valor por elogio e limites). Calculado — não é lançado à mão." />
      <RemTabs active="/remuneracao/elogios" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card title={`Prêmios do mês (${month.slice(5)}/${month.slice(0, 4)}) pela regra vigente`}>
            {!rule ? <p className="text-sm text-gold-600">Nenhuma regra cadastrada — elogios aprovados ficam como pendência no custo, sem valor estimado.</p> : byEmp.size === 0 ? <Empty>Nenhum elogio aprovado neste mês.</Empty> : (
              <ul className="divide-y divide-stone-100 text-sm">
                {[...byEmp.entries()].map(([id, v]) => { const p = elogioPremium(rule, v.list)!; return <li key={id} className="flex justify-between py-2"><Link href={`/remuneracao/colaborador/${id}`} className="hover:underline">{v.name}</Link><span className="tabular-nums">{p.counted} de {p.eligible} elogio(s) · <strong>{brl(p.value)}</strong></span></li>; })}
              </ul>
            )}
          </Card>
          <Card title="Elogios registrados">
            {elogios.length === 0 ? <Empty>Nenhum elogio.</Empty> : (
              <ul className="divide-y divide-stone-100 text-sm">
                {elogios.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-elogio={e.status}>
                    <span><span className="font-medium text-riale-900">{e.employee.fullName}</span> · {fmtDate(e.date)} · {e.source}{e.reference ? ` · ${e.reference}` : ""}<span className="block text-xs text-stone-500">{e.employee.department.name} · {e.employee.department.unit.name}{e.rejectReason ? ` · recusado: ${e.rejectReason}` : ""}</span></span>
                    {e.status === "PENDENTE" && manage ? (
                      <span className="flex gap-1">
                        <ActionForm action={decideElogioAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="APROVADO" /><Submit className="btn-primary btn-sm" pendingText="…">Aprovar</Submit></ActionForm>
                        <ActionForm action={decideElogioAction} className="flex gap-1"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="REJEITADO" /><input name="rejectReason" placeholder="Motivo" className="input w-32 py-1 text-xs" /><Submit className="btn-ghost btn-sm" pendingText="…">Recusar</Submit></ActionForm>
                      </span>
                    ) : <Badge tone={e.status === "APROVADO" ? "green" : e.status === "REJEITADO" ? "red" : "gold"}>{e.status.toLowerCase()}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {manage && (
            <Card title="Registrar elogio">
              <ActionForm action={elogioAction} resetOnSuccess className="space-y-3">
                <SelectField name="employeeId" label="Colaborador" placeholder="Escolha…" options={emps.map((e) => ({ value: e.id, label: e.fullName }))} />
                <Field name="date" label="Data do elogio" type="date" defaultValue={today} />
                <Field name="source" label="Origem" placeholder="Booking, Google, TripAdvisor, livro de hóspedes…" />
                <Field name="reference" label="Referência (nº da avaliação/reserva)" />
                <Field name="description" label="Trecho do elogio" />
                <Submit>Registrar</Submit>
              </ActionForm>
            </Card>
          )}
          <Card title="Regra vigente">
            {rule ? <p className="text-sm">{brl(rule.amountPerElogio)} por elogio aprovado{rule.maxPerMonth ? `, até ${rule.maxPerMonth} por mês` : ""}{rule.maxAmountPerMonth !== null ? `, teto de ${brl(rule.maxAmountPerMonth)}/mês` : ""}{rule.sources.length ? `; origens: ${rule.sources.join(", ")}` : "; todas as origens"} · desde {fmtDate(rule.effectiveFrom)}</p> : <p className="text-sm text-stone-500">Não cadastrada.</p>}
            {rules.length > 1 && <p className="mt-2 text-xs text-stone-400">Histórico: {rules.slice(1).map((r) => `${fmtDate(r.effectiveFrom)} ${brl(Number(r.amountPerElogio))}`).join(" · ")}</p>}
            {config && (
              <ActionForm action={elogioRuleAction} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                <Field name="amountPerElogio" label="Valor por elogio (R$)" inputMode="decimal" />
                <Field name="maxPerMonth" label="Máximo de elogios premiados por mês (opcional)" inputMode="numeric" />
                <Field name="maxAmountPerMonth" label="Teto mensal em R$ (opcional)" inputMode="decimal" />
                <Field name="sources" label="Origens válidas (separadas por vírgula; vazio = todas)" />
                <Field name="effectiveFrom" label="Vigência a partir de" type="date" defaultValue={today} />
                <Field name="notes" label="Regulamento / observações" />
                <Submit>Registrar nova regra</Submit>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
