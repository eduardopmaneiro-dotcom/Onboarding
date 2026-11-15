import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { listDepartments, listUnits } from "@/modules/org/service";
import { ActionForm, CheckboxField, Field, SelectField, Submit } from "@/components/forms";
import { Card, PageHeader, StatusBadge, TableWrap } from "@/components/ui";
import { saveDepartmentAction } from "../actions";

export const metadata = { title: "Departamentos" };

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ editar?: string; unidade?: string }> }) {
  const user = await requirePermission("org.manage");
  const { editar, unidade } = await searchParams;
  const [units, departments] = await Promise.all([listUnits(user), listDepartments(user, { unitId: unidade, includeInactive: true })]);
  const editing = departments.find((d) => d.id === editar);
  const unitOptions = units.map((u) => ({ value: u.id, label: u.name }));

  return (
    <>
      <PageHeader title="Departamentos" subtitle="Áreas de cada unidade. Um departamento pode ter mais de um gestor." breadcrumb={{ href: "/configuracoes", label: "Configurações" }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card
          title={`${departments.length} departamento(s)`}
          actions={
            units.length > 1 && (
              <div className="flex flex-wrap gap-1 text-xs">
                <Link href="?" className={`rounded px-2 py-1 ${!unidade ? "bg-riale-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Todas</Link>
                {units.map((u) => (
                  <Link key={u.id} href={`?unidade=${u.id}`} className={`rounded px-2 py-1 ${unidade === u.id ? "bg-riale-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{u.name}</Link>
                ))}
              </div>
            )
          }
        >
          <TableWrap>
            <table className="table">
              <thead><tr><th>Departamento</th><th>Unidade</th><th>Gestores</th><th>Status</th><th /></tr></thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium text-riale-900">{d.name} {d.code && <span className="ml-1 font-mono text-[10px] text-slate-400">{d.code}</span>}</td>
                    <td>{d.unit.name}</td>
                    <td>{d._count.managers}</td>
                    <td><StatusBadge active={d.active} /></td>
                    <td className="text-right"><Link href={`?editar=${d.id}${unidade ? `&unidade=${unidade}` : ""}`} className="text-xs font-medium text-gold-600 hover:underline">Editar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title={editing ? `Editar: ${editing.name}` : "Novo departamento"} actions={editing && <Link href="?" className="text-xs text-slate-500 hover:underline">cancelar</Link>}>
          <ActionForm key={editing?.id ?? "new"} action={saveDepartmentAction} className="space-y-4" resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <SelectField name="unitId" label="Unidade" options={unitOptions} defaultValue={editing?.unit.id ?? unidade} placeholder="Selecione…" required />
            <Field name="name" label="Nome" defaultValue={editing?.name} required />
            <Field name="code" label="Sigla (opcional)" defaultValue={editing?.code ?? ""} />
            {editing && <CheckboxField name="active" label="Departamento ativo" defaultChecked={editing.active} />}
            <Submit>{editing ? "Salvar alterações" : "Cadastrar departamento"}</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
