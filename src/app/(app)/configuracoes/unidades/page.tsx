import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { listUnits } from "@/modules/org/service";
import { isCorporate } from "@/modules/shared/scope";
import { ActionForm, CheckboxField, Field, Submit } from "@/components/forms";
import { Card, PageHeader, StatusBadge, TableWrap } from "@/components/ui";
import { saveUnitAction } from "../actions";

export const metadata = { title: "Unidades" };

export default async function UnitsPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const user = await requirePermission("org.manage");
  const { editar } = await searchParams;
  const units = await listUnits(user, { includeInactive: true });
  const editing = units.find((u) => u.id === editar);
  const canEdit = isCorporate(user);

  return (
    <>
      <PageHeader title="Unidades" subtitle="Hotéis do grupo Riale." breadcrumb={{ href: "/configuracoes", label: "Configurações" }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title={`${units.length} unidade(s)`}>
          <TableWrap>
            <table className="table">
              <thead>
                <tr><th>Unidade</th><th>Código</th><th>Cidade</th><th>Departamentos</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-riale-900">{u.name}</td>
                    <td className="font-mono text-xs">{u.code}</td>
                    <td>{u.city ? `${u.city}/${u.state}` : "—"}</td>
                    <td>{u._count.departments}</td>
                    <td><StatusBadge active={u.active} /></td>
                    <td className="text-right">{canEdit && <Link href={`?editar=${u.id}`} className="text-xs font-medium text-gold-600 hover:underline">Editar</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        {canEdit ? (
          <Card title={editing ? `Editar: ${editing.name}` : "Nova unidade"} actions={editing && <Link href="?" className="text-xs text-slate-500 hover:underline">cancelar</Link>}>
            <ActionForm key={editing?.id ?? "new"} action={saveUnitAction} className="space-y-4" resetOnSuccess={!editing}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field name="name" label="Nome" defaultValue={editing?.name} required />
              <Field name="code" label="Código" defaultValue={editing?.code} hint="Ex.: IPANEMA (A–Z, 0–9, _)" required />
              <div className="grid grid-cols-[minmax(0,1fr)_80px] gap-3">
                <Field name="city" label="Cidade" defaultValue={editing?.city ?? "Rio de Janeiro"} />
                <Field name="state" label="UF" defaultValue={editing?.state ?? "RJ"} maxLength={2} />
              </div>
              {editing && <CheckboxField name="active" label="Unidade ativa" defaultChecked={editing.active} />}
              <Submit>{editing ? "Salvar alterações" : "Cadastrar unidade"}</Submit>
            </ActionForm>
          </Card>
        ) : (
          <Card title="Somente leitura"><p className="text-sm text-slate-500">O cadastro de unidades é feito pelo Administrador ou pelo RH corporativo.</p></Card>
        )}
      </div>
    </>
  );
}
