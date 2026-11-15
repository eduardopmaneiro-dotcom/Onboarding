import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { listDepartments, listPositions } from "@/modules/org/service";
import { listManagers } from "@/modules/managers/service";
import { ActionForm, CpfField, CheckboxField, Field, SelectField, Submit } from "@/components/forms";
import { RevealCpf } from "@/components/reveal-cpf";
import { Badge, Card, Empty, PageHeader, StatusBadge, TableWrap } from "@/components/ui";
import { revealManagerCpfAction, saveManagerAction } from "../actions";

export const metadata = { title: "Gestores" };

export default async function ManagersPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const user = await requirePermission("managers.manage");
  const { editar } = await searchParams;
  const [managers, departments, positions] = await Promise.all([listManagers(user, { includeInactive: true }), listDepartments(user), listPositions(user)]);
  const editing = managers.find((m) => m.id === editar);
  const pii = can(user, "pii.reveal");

  return (
    <>
      <PageHeader
        title="Gestores e superiores diretos"
        subtitle="O e-mail do gestor será usado nas comunicações automáticas (vagas, entrevistas, admissões)."
        breadcrumb={{ href: "/configuracoes", label: "Configurações" }}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={`${managers.length} gestor(es)`}>
          {managers.length === 0 ? (
            <Empty>Nenhum gestor cadastrado.</Empty>
          ) : (
            <TableWrap>
              <table className="table">
                <thead><tr><th>Gestor</th><th>Identificação</th><th>Cargo</th><th>Departamento</th><th>Superior direto</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {managers.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <p className="font-medium text-riale-900">{m.name}</p>
                        <p className="text-xs text-slate-500">{m.email}</p>
                      </td>
                      <td className="whitespace-nowrap">
                        {m.hasCpf ? pii ? <RevealCpf masked={m.cpfMasked} reveal={revealManagerCpfAction.bind(null, m.id)} /> : <span className="font-mono text-xs text-slate-500">{m.cpfMasked}</span> : null}
                        {m.internalId && <p className="font-mono text-xs text-slate-500">Mat. {m.internalId}</p>}
                      </td>
                      <td>{m.position.title}</td>
                      <td>
                        <p>{m.department.name}</p>
                        <p className="text-xs text-slate-400">{m.department.unit.name}</p>
                      </td>
                      <td>{m.directSuperior?.name ?? <span className="text-slate-400">—</span>}</td>
                      <td className="space-y-1">
                        <StatusBadge active={m.active} />
                        {m.user && <div><Badge tone="blue">com acesso</Badge></div>}
                      </td>
                      <td className="text-right"><Link href={`?editar=${m.id}`} className="text-xs font-medium text-gold-600 hover:underline">Editar</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title={editing ? `Editar: ${editing.name}` : "Novo gestor"} actions={editing && <Link href="?" className="text-xs text-slate-500 hover:underline">cancelar</Link>}>
          <ActionForm key={editing?.id ?? "new"} action={saveManagerAction} className="space-y-4" resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field name="name" label="Nome completo" defaultValue={editing?.name} required />
            <Field name="email" label="E-mail corporativo" type="email" defaultValue={editing?.email} required />
            <div className="grid grid-cols-2 gap-3">
              <CpfField required={false} hint={editing?.hasCpf ? "Em branco mantém o atual" : "CPF ou matrícula"} />
              <Field name="internalId" label="Matrícula" defaultValue={editing?.internalId ?? ""} />
            </div>
            <SelectField name="positionId" label="Cargo" placeholder="Selecione…" defaultValue={editing?.position.id} options={positions.map((p) => ({ value: p.id, label: `${p.title} (${p.level})` }))} required />
            <SelectField name="departmentId" label="Departamento" placeholder="Selecione…" defaultValue={editing?.department.id} options={departments.map((d) => ({ value: d.id, label: `${d.unit.name} › ${d.name}` }))} required />
            <SelectField
              name="directSuperiorId"
              label="Superior direto"
              placeholder="— Nenhum (topo da hierarquia) —"
              defaultValue={editing?.directSuperior?.id}
              options={managers.filter((m) => m.active && m.id !== editing?.id).map((m) => ({ value: m.id, label: `${m.name} — ${m.position.title}, ${m.department.unit.name}` }))}
            />
            {editing && <CheckboxField name="active" label="Gestor ativo" defaultChecked={editing.active} />}
            <Submit>{editing ? "Salvar alterações" : "Cadastrar gestor"}</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
