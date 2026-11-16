import { requirePermission } from "@/lib/session";
import { getSetting } from "@/modules/settings/service";
import { listClinics, listDocTypes } from "@/modules/admission/config";
import { CONDITION_LABEL, DOC_CATEGORIES } from "@/modules/admission/constants";
import { milestoneDate, parseMilestones } from "@/modules/people/rules";
import { ActionForm, CheckboxField, Field, SelectField, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { saveClinicAction, saveDocTypeAction, saveRulesAction } from "../actions";

export const metadata = { title: "Configurações da admissão" };
export const dynamic = "force-dynamic";

const fmt = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

export default async function AdmissionConfigPage() {
  await requirePermission("admissoes.config");
  const [types, clinics, marcos, conta, aviso, email] = await Promise.all([
    listDocTypes(), listClinics(true), getSetting("experiencia.marcos"), getSetting("experiencia.conta_dia_admissao"), getSetting("experiencia.aviso_dias"), getSetting("experiencia.alerta_email"),
  ]);
  const example = "2026-03-02";
  const cats = Object.entries(DOC_CATEGORIES).map(([value, label]) => ({ value, label }));
  const conds = Object.entries(CONDITION_LABEL).map(([value, label]) => ({ value, label }));

  return (
    <>
      <PageHeader title="Configurações da admissão" subtitle="Checklist documental, clínicas do exame admissional e regras do período de experiência." breadcrumb={{ href: "/admissoes", label: "Admissões" }} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Regras da experiência">
          <ActionForm action={saveRulesAction} className="space-y-4">
            <Field name="experiencia.marcos" label="Marcos (dias, separados por vírgula)" defaultValue={marcos} hint="O último marco é o fim do período de experiência (contrato de experiência: até 90 dias)." />
            <CheckboxField name="experiencia.conta_dia_admissao" label="O dia da admissão conta como 1º dia (regra da CLT para prazos do contrato)" defaultChecked={conta} />
            <Field name="experiencia.aviso_dias" label="Avisar o RH quantos dias antes de cada marco" type="number" min={0} max={30} defaultValue={aviso} />
            <CheckboxField name="experiencia.alerta_email" label="Enviar os alertas também por e-mail ao RH" defaultChecked={email} />
            <p className="rounded-lg bg-riale-50 px-3 py-2 text-xs text-stone-600">
              Exemplo com a regra atual — admissão em {fmt(example)}: {parseMilestones(marcos).map((d) => `${d} dias em ${fmt(milestoneDate(example, d, conta))}`).join(" · ")}.
              Mudanças valem para as próximas admissões; quem já foi admitido mantém as datas do próprio contrato.
            </p>
            <Submit>Salvar regras</Submit>
          </ActionForm>
        </Card>

        <Card title="Clínicas do exame admissional">
          <ul className="mb-4 divide-y divide-stone-100 text-sm">
            {clinics.map((c) => (
              <li key={c.id} className="py-2">
                <details>
                  <summary className="cursor-pointer"><span className="font-medium text-riale-900">{c.name}</span> {!c.active && <Badge>inativa</Badge>}<span className="block text-xs text-stone-500">{[c.address, c.phone].filter(Boolean).join(" · ") || "—"}</span></summary>
                  <ActionForm action={saveClinicAction} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} />
                    <Field name="name" label="Nome" defaultValue={c.name} />
                    <Field name="phone" label="Telefone" defaultValue={c.phone ?? ""} />
                    <Field name="address" label="Endereço" defaultValue={c.address ?? ""} className="sm:col-span-2" />
                    <CheckboxField name="active" label="Ativa" defaultChecked={c.active} />
                    <Submit className="btn-ghost btn-sm">Salvar</Submit>
                  </ActionForm>
                </details>
              </li>
            ))}
            {!clinics.length && <li className="py-2 text-stone-500">Nenhuma clínica cadastrada.</li>}
          </ul>
          <ActionForm action={saveClinicAction} resetOnSuccess className="grid gap-2 rounded-lg bg-riale-50 p-3 sm:grid-cols-2">
            <Field name="name" label="Nova clínica" placeholder="Nome da clínica" />
            <Field name="phone" label="Telefone" />
            <Field name="address" label="Endereço" className="sm:col-span-2" />
            <input type="hidden" name="active" value="true" />
            <Submit className="btn-primary btn-sm">Adicionar clínica</Submit>
          </ActionForm>
        </Card>

        <Card title="Checklist documental" className="xl:col-span-2">
          <p className="mb-3 text-xs text-stone-500">Itens novos entram automaticamente nos processos em andamento. Desativar um item não apaga o que já foi recebido.</p>
          <ul className="mb-4 divide-y divide-stone-100 text-sm">
            {types.map((t) => (
              <li key={t.id} className="py-2">
                <details>
                  <summary className="cursor-pointer">
                    <span className={`font-medium ${t.active ? "text-riale-900" : "text-stone-400 line-through"}`}>{t.label}</span>{" "}
                    <Badge>{DOC_CATEGORIES[t.category] ?? t.category}</Badge> {t.required ? <Badge tone="gold">obrigatório</Badge> : <Badge>opcional</Badge>} {t.condition !== "SEMPRE" && <Badge tone="blue">{CONDITION_LABEL[t.condition]}</Badge>}
                  </summary>
                  <ActionForm action={saveDocTypeAction} className="mt-2 grid gap-2 sm:grid-cols-4">
                    <input type="hidden" name="id" value={t.id} />
                    <Field name="label" label="Documento" defaultValue={t.label} className="sm:col-span-2" />
                    <SelectField name="category" label="Grupo" defaultValue={t.category} options={cats} />
                    <SelectField name="condition" label="Quando exigir" defaultValue={t.condition} options={conds} />
                    <Field name="sortOrder" label="Ordem" type="number" defaultValue={t.sortOrder} />
                    <div className="flex items-end gap-4 sm:col-span-2"><CheckboxField name="required" label="Obrigatório" defaultChecked={t.required} /><CheckboxField name="active" label="Ativo" defaultChecked={t.active} /></div>
                    <div className="flex items-end"><Submit className="btn-ghost btn-sm">Salvar</Submit></div>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
          <ActionForm action={saveDocTypeAction} resetOnSuccess className="grid gap-2 rounded-lg bg-riale-50 p-3 sm:grid-cols-4">
            <Field name="label" label="Novo documento" className="sm:col-span-2" />
            <SelectField name="category" label="Grupo" options={cats} />
            <SelectField name="condition" label="Quando exigir" options={conds} />
            <Field name="sortOrder" label="Ordem" type="number" defaultValue={100} />
            <div className="flex items-end sm:col-span-2"><CheckboxField name="required" label="Obrigatório" defaultChecked /></div>
            <input type="hidden" name="active" value="true" />
            <div className="flex items-end"><Submit className="btn-primary btn-sm">Adicionar ao checklist</Submit></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
