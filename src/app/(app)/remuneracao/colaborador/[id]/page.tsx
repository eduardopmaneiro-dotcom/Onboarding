import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDate, todayKey } from "@/lib/datetime";
import { employeeCompensation, listBenefits, listPayItemTypes } from "@/modules/compensation/service";
import { isCompetence } from "@/modules/compensation/calc";
import { PAY_CATEGORY_LABEL } from "@/modules/compensation/constants";
import { ActionForm, Field, SelectField, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { brl } from "@/components/rem-tabs";
import { deletePayItemAction, elogioAction, employeeSalaryAction, endBenefitAction, enrollAction, payItemAction } from "../../actions";

export const metadata = { title: "Remuneração do colaborador" };
export const dynamic = "force-dynamic";

function Line({ label, value, hint, strong, sub }: { label: string; value: string; hint?: string; strong?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "border-t border-stone-200 font-semibold text-riale-900" : ""} ${sub ? "pl-4 text-xs text-stone-500" : "text-sm"}`}>
      <span>{label}{hint && <span className="ml-1 text-[11px] font-normal text-stone-400">{hint}</span>}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

export default async function EmployeeCompPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const user = await requirePermission("remuneracao.view");
  const { id } = await params;
  const sp = await searchParams;
  const c = isCompetence(sp.c) ? sp.c : todayKey().slice(0, 7);
  const [d, types, benefits] = await Promise.all([employeeCompensation(user, id, c), listPayItemTypes(), listBenefits(false)]);
  const e = d.employee;
  const manage = can(user, "remuneracao.manage") && e.status !== "DESLIGADO";
  const x = d.row?.comp;
  const offered = benefits.filter((b) => b.allUnits || b.units.some((u) => u.unitId === e.department.unitId));

  return (
    <>
      <PageHeader title={e.fullName} subtitle={`Remuneração · matrícula ${e.internalId ?? "—"} · admissão ${fmtDate(e.admissionDate)}${e.status === "DESLIGADO" ? ` · desligado em ${fmtDate(e.terminationDate)}` : ""}`} breadcrumb={{ href: `/remuneracao?c=${c}`, label: "Remuneração" }} actions={<Link href={`/colaboradores/${e.id}`} className="btn-ghost">Ficha do colaborador</Link>} />
      <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title={`Composição — competência ${c.slice(5, 7)}/${c.slice(0, 4)}`} actions={<form className="flex gap-1"><input type="month" name="c" defaultValue={c} className="input w-auto py-1 text-xs" aria-label="Competência" /><button className="btn-ghost btn-sm">Ver</button></form>}>
            {!x ? <p className="text-sm text-stone-500">Sem vínculo nesta competência.</p> : (
              <div data-breakdown>
                <Line label="Salário-base (contrato)" value={brl(x.base)} />
                {x.basePaid !== null && <Line label="Salário-base pago" value={brl(x.basePaid)} sub />}
                {d.row!.tableRef && <Line label={`Tabela do cargo (${d.row!.tableRef.scope})`} value={brl(d.row!.tableRef.value)} sub />}
                <Line label="Adicionais" value={brl(x.adicionais)} />
                {d.row!.items.filter((i) => i.category === "ADICIONAL").map((i, k) => <Line key={`a${k}`} label={i.label} value={brl(i.amount)} sub />)}
                <Line label="Variáveis" value={brl(x.variaveis)} />
                {d.row!.items.filter((i) => i.category === "VARIAVEL").map((i, k) => <Line key={`v${k}`} label={i.label} value={brl(i.amount)} sub />)}
                <Line label="Premiações" value={brl(x.premiacoes)} />
                <Line label="Elogio Premiado" value={x.elogio ? brl(x.elogio.value) : "—"} hint={x.elogio ? `${x.elogio.counted} elogio(s) pela regra` : d.rule ? "sem elogios aprovados" : "regra não cadastrada"} />
                <Line label="PPR (provisão mensal)" value={x.ppr ? brl(x.ppr.monthly) : "—"} hint={x.ppr?.projected ? "projeção a 100% das metas" : undefined} />
                <Line label="Remuneração em dinheiro" value={brl(x.remuneracaoDinheiro)} strong />
                <Line label="Benefícios (custo líquido)" value={brl(x.beneficios.net)} hint={`bruto ${brl(x.beneficios.gross)} − desconto ${brl(x.beneficios.discount)}`} />
                {d.row!.benefits.map((b, k) => <Line key={`b${k}`} label={b.name} value={b.net === null ? "valor pendente" : brl(b.net)} sub />)}
                <Line label="Remuneração total" value={brl(x.remuneracaoTotal)} strong />
                <Line label="Encargos estimados" value={x.encargos.total === null ? "sem parâmetros" : brl(x.encargos.total)} hint={`base ${brl(x.encargos.base)}`} />
                {x.encargos.items.map((i, k) => <Line key={`c${k}`} label={`${i.label} (${String(i.ratePct).replace(".", ",")}%)`} value={brl(i.value)} sub />)}
                <Line label="Custo total estimado" value={brl(x.custoTotal)} strong />
                {x.partial.length > 0 && <ul className="mt-3 space-y-1 rounded-lg bg-gold-100/40 p-3 text-xs text-stone-600">{x.partial.map((p) => <li key={p}>○ {p}</li>)}</ul>}
              </div>
            )}
          </Card>

          <Card title="Histórico do salário-base">
            <ul className="mb-3 space-y-1 text-sm">
              {d.salaries.map((s) => <li key={s.id} className="flex justify-between"><span>{fmtDate(s.effectiveFrom)} · <span className="text-stone-500">{s.reason}</span></span><span className="tabular-nums">{brl(Number(s.amount))}</span></li>)}
              <li className="flex justify-between text-stone-500"><span>{fmtDate(e.admissionDate)} · admissão</span><span className="tabular-nums">{e.baseSalary ? brl(Number(e.baseSalary)) : "não informado"}</span></li>
            </ul>
            {manage && (
              <ActionForm action={employeeSalaryAction} className="grid gap-2 rounded-lg bg-riale-50 p-3 sm:grid-cols-2">
                <input type="hidden" name="employeeId" value={e.id} />
                <Field name="amount" label="Novo salário-base (R$)" inputMode="decimal" />
                <Field name="effectiveFrom" label="Vigência" type="date" defaultValue={todayKey()} />
                <Field name="reason" label="Motivo" placeholder="Promoção, dissídio, mérito…" className="sm:col-span-2" />
                <Submit className="btn-primary btn-sm">Registrar alteração</Submit>
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Lançamentos pagos (adicionais, variáveis, premiações)">
            {manage && (
              <ActionForm action={payItemAction} className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_140px_minmax(0,1fr)_auto] sm:items-end">
                <input type="hidden" name="employeeId" value={e.id} />
                <SelectField name="typeId" label="Rubrica" placeholder="Escolha…" options={types.filter((t) => !t.system).map((t) => ({ value: t.id, label: `${t.label} (${PAY_CATEGORY_LABEL[t.category]})` }))} />
                <Field name="competence" label="Competência" type="month" defaultValue={c} />
                <Field name="amount" label="Valor (R$)" inputMode="decimal" />
                <Field name="description" label="Observação" />
                <Submit className="btn-primary btn-sm">Lançar</Submit>
              </ActionForm>
            )}
            {d.payItems.length === 0 ? <p className="text-sm text-stone-500">Nenhum lançamento.</p> : (
              <ul className="divide-y divide-stone-100 text-sm">
                {d.payItems.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                    <span><span className="font-mono text-xs text-stone-400">{i.competence}</span> {i.type.label} <Badge>{PAY_CATEGORY_LABEL[i.type.category]}</Badge>{i.description && <span className="block text-xs text-stone-500">{i.description}</span>}</span>
                    <span className="flex items-center gap-2 tabular-nums">{brl(Number(i.amount))}{manage && <ActionForm action={deletePayItemAction}><input type="hidden" name="id" value={i.id} /><Submit className="text-xs text-stone-400 hover:text-red-700" pendingText="…">excluir</Submit></ActionForm>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Benefícios">
            <ul className="mb-4 divide-y divide-stone-100 text-sm">
              {d.benefits.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{b.benefit.name} {b.endDate ? <Badge>encerrado em {fmtDate(b.endDate)}</Badge> : <Badge tone="green">ativo desde {fmtDate(b.startDate)}</Badge>}<span className="block text-xs text-stone-500">{[b.daysPerMonth && `${b.daysPerMonth} dias/mês`, b.companyCost && `valor individual ${brl(Number(b.companyCost))}`, b.dependents && `${b.dependents} dependente(s)`].filter(Boolean).join(" · ") || "valor do benefício"}</span></span>
                  {manage && !b.endDate && (
                    <ActionForm action={endBenefitAction} className="flex items-center gap-1"><input type="hidden" name="id" value={b.id} /><input type="date" name="endDate" defaultValue={todayKey()} className="input w-auto py-1 text-xs" aria-label="Fim" /><Submit className="btn-ghost btn-sm" pendingText="…">Encerrar</Submit></ActionForm>
                  )}
                </li>
              ))}
              {!d.benefits.length && <li className="py-2 text-stone-500">Nenhum benefício.</li>}
            </ul>
            {manage && (
              <ActionForm action={enrollAction} className="grid gap-2 rounded-lg bg-riale-50 p-3 sm:grid-cols-3">
                <input type="hidden" name="employeeId" value={e.id} />
                <SelectField name="benefitId" label="Benefício" placeholder="Escolha…" options={offered.map((b) => ({ value: b.id, label: b.name }))} />
                <Field name="startDate" label="Início" type="date" defaultValue={dateKey(e.admissionDate) > todayKey().slice(0, 8) + "01" ? dateKey(e.admissionDate) : todayKey().slice(0, 8) + "01"} />
                <Field name="daysPerMonth" label="Dias/mês (benefício por dia)" inputMode="numeric" />
                <Field name="companyCost" label="Valor individual (opcional)" inputMode="decimal" hint="Ex.: tarifa diária do VT do colaborador" />
                <Field name="dependents" label="Dependentes" inputMode="numeric" defaultValue="0" />
                <div className="flex items-end"><Submit className="btn-primary btn-sm">Incluir benefício</Submit></div>
              </ActionForm>
            )}
          </Card>

          <Card title="Elogios">
            <ul className="mb-3 divide-y divide-stone-100 text-sm">
              {d.elogios.map((el) => <li key={el.id} className="flex justify-between py-1.5"><span>{fmtDate(el.date)} · {el.source}{el.reference ? ` · ${el.reference}` : ""}</span><Badge tone={el.status === "APROVADO" ? "green" : el.status === "REJEITADO" ? "red" : "gold"}>{el.status.toLowerCase()}</Badge></li>)}
              {!d.elogios.length && <li className="py-1.5 text-stone-500">Nenhum elogio registrado.</li>}
            </ul>
            {manage && (
              <ActionForm action={elogioAction} className="grid gap-2 rounded-lg bg-riale-50 p-3 sm:grid-cols-4">
                <input type="hidden" name="employeeId" value={e.id} />
                <Field name="date" label="Data" type="date" defaultValue={todayKey()} />
                <Field name="source" label="Origem" placeholder="Booking, Google…" />
                <Field name="reference" label="Referência" />
                <div className="flex items-end"><Submit className="btn-primary btn-sm">Registrar</Submit></div>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
