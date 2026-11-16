import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { listBenefits } from "@/modules/compensation/service";
import { BENEFIT_CATEGORY_LABEL, COST_TYPE_LABEL, DISCOUNT_LABEL } from "@/modules/compensation/constants";
import { ActionForm, CheckboxField, Field, SelectField, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { RemTabs, brl, moneyInput } from "@/components/rem-tabs";
import { benefitAction, benefitUnitAction } from "../actions";

export const metadata = { title: "Benefícios" };
export const dynamic = "force-dynamic";

type B = Awaited<ReturnType<typeof listBenefits>>[number];

function BenefitForm({ b, units }: { b?: B; units: Array<{ id: string; name: string }> }) {
  const cats = Object.entries(BENEFIT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
  return (
    <ActionForm action={benefitAction} resetOnSuccess={!b} className="grid gap-3 sm:grid-cols-3">
      {b && <input type="hidden" name="id" value={b.id} />}
      <Field name="name" label="Nome" defaultValue={b?.name ?? ""} />
      <SelectField name="category" label="Tipo" defaultValue={b?.category ?? "OUTRO"} options={cats} />
      <Field name="provider" label="Fornecedor / operadora" defaultValue={b?.provider ?? ""} />
      <SelectField name="costType" label="Forma de custo" defaultValue={b?.costType ?? "MENSAL"} options={Object.entries(COST_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
      <Field name="companyCost" label="Custo da empresa (R$/mês ou R$/dia)" inputMode="decimal" defaultValue={moneyInput(b?.companyCost)} placeholder="não informado" />
      <Field name="dependentCost" label="Custo por dependente (R$)" inputMode="decimal" defaultValue={moneyInput(b?.dependentCost)} placeholder="não se aplica" />
      <SelectField name="discountType" label="Desconto do colaborador" defaultValue={b?.discountType ?? "NENHUM"} options={Object.entries(DISCOUNT_LABEL).map(([value, label]) => ({ value, label }))} />
      <Field name="discountValue" label="Valor do desconto (R$ ou %)" inputMode="decimal" defaultValue={moneyInput(b?.discountValue)} />
      <Field name="valueSource" label="Origem dos valores (obrigatória com valor)" defaultValue={b?.valueSource ?? ""} placeholder="Contrato, tabela, documento…" />
      <Field name="description" label="Descrição / regra" defaultValue={b?.description ?? ""} className="sm:col-span-3" />
      <div className="sm:col-span-3">
        <CheckboxField name="allUnits" label="Oferecido em todas as unidades" defaultChecked={b?.allUnits ?? true} />
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-600">
          <span className="text-xs text-stone-500">Se não, só em:</span>
          {units.map((u) => <label key={u.id} className="flex items-center gap-1.5"><input type="checkbox" name="unitIds" value={u.id} defaultChecked={b?.units.some((x) => x.unitId === u.id)} className="accent-riale-900" />{u.name}</label>)}
        </div>
      </div>
      <div className="flex items-center gap-4 sm:col-span-3"><CheckboxField name="active" label="Ativo" defaultChecked={b?.active ?? true} /><Submit>{b ? "Salvar benefício" : "Adicionar benefício"}</Submit></div>
    </ActionForm>
  );
}

export default async function BenefitsPage() {
  const user = await requirePermission("remuneracao.view");
  const [benefits, units] = await Promise.all([listBenefits(), prisma.unit.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const config = can(user, "remuneracao.config") && (user.role === "ADMIN" || !user.unitId);
  return (
    <>
      <PageHeader title="Remuneração" subtitle="Base institucional de benefícios. Valores vêm da empresa, com a origem registrada; sem valor, o benefício fica como pendência no custo." />
      <RemTabs active="/remuneracao/beneficios" />
      <div className="space-y-4">
        {benefits.map((b) => {
          const missing = b.costType !== "SEM_CUSTO" && b.companyCost === null;
          return (
            <Card key={b.id} title={b.name} actions={<div className="flex gap-1.5">{!b.active && <Badge>inativo</Badge>}{missing ? <Badge tone="gold">valor não informado</Badge> : <Badge tone="green">{b.costType === "SEM_CUSTO" ? "sem custo" : `${brl(Number(b.companyCost))}${b.costType === "POR_DIA" ? "/dia" : "/mês"}`}</Badge>}<Badge>{b._count.enrollments} ativo(s)</Badge></div>}>
              <p className="text-sm text-stone-600">{BENEFIT_CATEGORY_LABEL[b.category]} · {COST_TYPE_LABEL[b.costType]} · {DISCOUNT_LABEL[b.discountType]}{b.discountValue !== null ? ` (${b.discountType === "PERCENTUAL_SALARIO" ? `${Number(b.discountValue)}%` : brl(Number(b.discountValue))})` : ""}{b.dependentCost !== null ? ` · dependente ${brl(Number(b.dependentCost))}` : ""}</p>
              <p className="text-xs text-stone-500">{b.allUnits ? "Todas as unidades" : `Unidades: ${b.units.map((u) => u.unit.name).join(", ") || "nenhuma definida"}`}{b.valueSource ? ` · origem: ${b.valueSource}` : ""}{b.provider ? ` · ${b.provider}` : ""}</p>
              {b.description && <p className="mt-1 text-xs text-stone-400">{b.description}</p>}
              {config && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-gold-600">Editar</summary>
                  <div className="mt-3"><BenefitForm b={b} units={units} /></div>
                  {!b.allUnits && b.units.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-stone-100 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Valor por unidade (opcional)</p>
                      {b.units.map((u) => (
                        <ActionForm key={u.unitId} action={benefitUnitAction} className="flex items-center gap-2 text-sm">
                          <input type="hidden" name="benefitId" value={b.id} /><input type="hidden" name="unitId" value={u.unitId} />
                          <span className="w-32">{u.unit.name}</span>
                          <input name="companyCost" defaultValue={moneyInput(u.companyCost)} placeholder="usa o valor geral" className="input w-40 py-1 text-xs" aria-label={`Valor — ${u.unit.name}`} />
                          <Submit className="btn-ghost btn-sm" pendingText="…">Salvar</Submit>
                        </ActionForm>
                      ))}
                    </div>
                  )}
                </details>
              )}
            </Card>
          );
        })}
        {config && <Card title="Outro benefício"><BenefitForm units={units} /></Card>}
      </div>
    </>
  );
}
