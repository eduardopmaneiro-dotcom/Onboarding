import { can, requirePermission } from "@/lib/session";
import { listPayItemTypes, listRates } from "@/modules/compensation/service";
import { PAY_CATEGORY_LABEL } from "@/modules/compensation/constants";
import { ActionForm, CheckboxField, Field, SelectField, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { RemTabs } from "@/components/rem-tabs";
import { payTypeAction, rateAction, rateUnitAction } from "../actions";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Encargos e rubricas" };
export const dynamic = "force-dynamic";

export default async function ParamsPage() {
  const user = await requirePermission("remuneracao.view");
  const [rates, types, units] = await Promise.all([listRates(), listPayItemTypes(true), prisma.unit.findMany({ where: { active: true }, orderBy: { name: "asc" } })]);
  const config = can(user, "remuneracao.config") && (user.role === "ADMIN" || !user.unitId);
  const total = rates.filter((r) => r.active && r.ratePct !== null).reduce((s, r) => s + Number(r.ratePct), 0);
  const cats = Object.entries(PAY_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader title="Remuneração" subtitle="Alíquotas de encargos (dependem do regime tributário, CNAE/FAP e FPAS — informe com a contabilidade) e rubricas de pagamento." />
      <RemTabs active="/remuneracao/parametros" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Encargos sobre a folha" actions={<span className="text-xs text-stone-500">Soma das alíquotas cadastradas: <strong>{total.toFixed(2).replace(".", ",")}%</strong></span>}>
          <ul className="space-y-3">
            {rates.map((r) => (
              <li key={r.id} className="rounded-lg border border-stone-200 p-3 text-sm">
                {config ? (
                  <>
                  <ActionForm action={rateAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_100px_auto] sm:items-end">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="label" value={r.label} /><input type="hidden" name="legalRef" value={r.legalRef ?? ""} />
                    <div><p className="font-medium text-riale-900">{r.label}</p><p className="text-xs text-stone-500">{r.legalRef}</p></div>
                    <Field name="ratePct" label="Alíquota (%)" inputMode="decimal" defaultValue={r.ratePct === null ? "" : String(Number(r.ratePct)).replace(".", ",")} placeholder="não informada" />
                    <Field name="apprenticeRatePct" label="Aprendiz (%)" inputMode="decimal" defaultValue={r.apprenticeRatePct === null ? "" : String(Number(r.apprenticeRatePct)).replace(".", ",")} placeholder="igual" />
                    <div className="flex items-center gap-2"><CheckboxField name="active" label="Ativo" defaultChecked={r.active} /><Submit className="btn-ghost btn-sm" pendingText="…">Salvar</Submit></div>
                  </ActionForm>
                  <details className="mt-2"><summary className="cursor-pointer text-xs text-gold-600">Por unidade{r.units.length ? `: ${r.units.map((u) => `${u.unit.name} ${String(Number(u.ratePct)).replace(".", ",")}%`).join(" · ")}` : " (usa a geral)"}</summary>
                    <div className="mt-2 space-y-1">{units.map((u) => { const cur = r.units.find((x) => x.unitId === u.id); return (
                      <ActionForm key={u.id} action={rateUnitAction} className="flex items-center gap-2 text-xs"><input type="hidden" name="rateId" value={r.id} /><input type="hidden" name="unitId" value={u.id} /><span className="w-24">{u.name}</span><input name="ratePct" defaultValue={cur ? String(Number(cur.ratePct)).replace(".", ",") : ""} placeholder="geral" className="input w-24 py-1 text-xs" aria-label={`${r.label} — ${u.name}`} /><Submit className="btn-ghost btn-sm" pendingText="…">ok</Submit></ActionForm>
                    ); })}</div>
                  </details>
                  </>
                ) : <p>{r.label}: {r.ratePct === null ? "não informada" : `${Number(r.ratePct)}%`}</p>}
              </li>
            ))}
          </ul>
          {config && (
            <ActionForm action={rateAction} resetOnSuccess className="mt-4 grid gap-2 rounded-lg bg-riale-50 p-3 sm:grid-cols-3">
              <Field name="label" label="Outro encargo" /><Field name="ratePct" label="Alíquota (%)" inputMode="decimal" /><Field name="legalRef" label="Referência" />
              <input type="hidden" name="active" value="true" /><Submit className="btn-primary btn-sm">Adicionar</Submit>
            </ActionForm>
          )}
          <p className="mt-3 text-xs text-stone-400">Sem alíquota informada, o encargo não entra no custo (o painel mostra a pendência). A base de cálculo são as rubricas marcadas “incide encargos”.</p>
        </Card>
        <Card title="Rubricas de pagamento">
          <ul className="divide-y divide-stone-100 text-sm">
            {types.map((t) => (
              <li key={t.id} className="py-2">
                <div className="flex flex-wrap items-center gap-1.5"><span className={t.active ? "text-riale-900" : "text-stone-400 line-through"}>{t.label}</span><Badge>{PAY_CATEGORY_LABEL[t.category]}</Badge>{t.chargeable ? <Badge tone="gold">incide encargos</Badge> : <Badge>sem incidência</Badge>}{t.system && <Badge tone="blue">calculada pelas regras</Badge>}</div>
                {config && !t.system && (
                  <details className="mt-1"><summary className="cursor-pointer text-xs text-gold-600">editar</summary>
                    <ActionForm action={payTypeAction} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="id" value={t.id} /><Field name="label" label="Nome" defaultValue={t.label} /><SelectField name="category" label="Grupo" defaultValue={t.category} options={cats} /><div className="flex items-end gap-3"><CheckboxField name="chargeable" label="Incide encargos" defaultChecked={t.chargeable} /><CheckboxField name="active" label="Ativa" defaultChecked={t.active} /></div><Submit className="btn-ghost btn-sm">Salvar</Submit></ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {config && (
            <ActionForm action={payTypeAction} resetOnSuccess className="mt-4 grid gap-2 rounded-lg bg-riale-50 p-3 sm:grid-cols-3">
              <Field name="label" label="Nova rubrica" /><SelectField name="category" label="Grupo" options={cats} /><div className="flex items-end"><CheckboxField name="chargeable" label="Incide encargos" defaultChecked /></div>
              <input type="hidden" name="active" value="true" /><Submit className="btn-primary btn-sm">Adicionar</Submit>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
