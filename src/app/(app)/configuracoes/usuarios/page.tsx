import Link from "next/link";
import type { Role } from "@prisma/client";
import { can, requirePermission } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/permissions";
import { listUsers } from "@/modules/users/service";
import { listManagers } from "@/modules/managers/service";
import { listUnits } from "@/modules/org/service";
import { isCorporate } from "@/modules/shared/scope";
import { ActionForm, CpfField, CheckboxField, Field, SelectField, Submit } from "@/components/forms";
import { RevealCpf } from "@/components/reveal-cpf";
import { Badge, Card, PageHeader, StatusBadge, TableWrap } from "@/components/ui";
import { adminResetPasswordAction, revealUserCpfAction, saveUserAction } from "../actions";

export const metadata = { title: "Usuários" };

const ROLE_TONE: Record<Role, "gold" | "blue" | "gray"> = { ADMIN: "gold", RH: "blue", GESTOR: "gray" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const actor = await requirePermission("users.view");
  const { editar } = await searchParams;
  const [users, managers, units] = await Promise.all([listUsers(actor), listManagers(actor), listUnits(actor)]);
  const editing = users.find((u) => u.id === editar);
  const canManage = can(actor, "users.manage");
  const pii = can(actor, "pii.reveal");
  // Anti-escalonamento: RH só concede o perfil Gestor; RH de unidade não cria RH.
  const assignable: Role[] = actor.role === "ADMIN" ? ["ADMIN", "RH", "GESTOR"] : ["GESTOR"];
  const editable = (role: Role) => canManage && assignable.includes(role);
  const freeManagers = managers.filter((m) => !m.user || m.user.id === editing?.id);

  return (
    <>
      <PageHeader title="Usuários do sistema" subtitle="Login por CPF e senha. A senha inicial deve ser trocada no primeiro acesso." breadcrumb={{ href: "/configuracoes", label: "Configurações" }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={`${users.length} usuário(s)`}>
          <TableWrap>
            <table className="table">
              <thead><tr><th>Usuário</th><th>CPF</th><th>Perfil</th><th>Escopo</th><th>Último acesso</th><th>Status</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-medium text-riale-900">{u.name}</p>
                      <p className="text-xs text-stone-500">{u.email}</p>
                    </td>
                    <td className="whitespace-nowrap">{pii ? <RevealCpf masked={u.cpfMasked} reveal={revealUserCpfAction.bind(null, u.id)} /> : <span className="font-mono text-xs text-stone-500">{u.cpfMasked}</span>}</td>
                    <td><Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td className="text-xs">{u.role === "GESTOR" ? u.manager?.name ?? "—" : u.unit?.name ?? "Todas as unidades"}</td>
                    <td className="text-xs text-stone-500">{u.lastLoginAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "nunca"}</td>
                    <td className="space-y-1">
                      <StatusBadge active={u.active} />
                      {u.lockedUntil && u.lockedUntil > new Date() && <div><Badge tone="red">bloqueado</Badge></div>}
                      {u.mustChangePassword && <div><Badge tone="gold">trocar senha</Badge></div>}
                    </td>
                    <td className="text-right">{editable(u.role) && <Link href={`?editar=${u.id}`} className="text-xs font-medium text-gold-600 hover:underline">Editar</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        {canManage && (
          <div className="space-y-6">
            <Card title={editing ? `Editar: ${editing.name}` : "Novo usuário"} actions={editing && <Link href="?" className="text-xs text-stone-500 hover:underline">cancelar</Link>}>
              <ActionForm key={editing?.id ?? "new"} action={saveUserAction} className="space-y-4" resetOnSuccess={!editing}>
                {editing && <input type="hidden" name="id" value={editing.id} />}
                <Field name="name" label="Nome completo" defaultValue={editing?.name} required />
                <Field name="email" label="E-mail" type="email" defaultValue={editing?.email} required />
                {!editing && (
                  <CpfField label="CPF (login)" />
                )}
                <SelectField name="role" label="Perfil" defaultValue={editing?.role ?? assignable[assignable.length - 1]} options={assignable.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} required />
                {isCorporate(actor) && (
                  <SelectField name="unitId" label="Unidade (perfil RH)" placeholder="Todas as unidades (corporativo)" defaultValue={editing?.unit?.id} options={units.map((u) => ({ value: u.id, label: u.name }))} />
                )}
                <SelectField name="managerId" label="Cadastro de gestor (perfil Gestor)" placeholder="—" defaultValue={editing?.manager?.id} options={freeManagers.map((m) => ({ value: m.id, label: `${m.name} — ${m.department.unit.name} › ${m.department.name}` }))} />
                {!editing && <Field name="password" label="Senha inicial" type="password" autoComplete="new-password" hint="Mín. 10 caracteres com maiúscula, minúscula e número (Admin: 12 + símbolo)." required />}
                {editing && <CheckboxField name="active" label="Usuário ativo" defaultChecked={editing.active} />}
                <Submit>{editing ? "Salvar alterações" : "Cadastrar usuário"}</Submit>
              </ActionForm>
            </Card>

            {editing && (
              <Card title="Redefinir senha">
                <ActionForm action={adminResetPasswordAction} className="space-y-4" resetOnSuccess>
                  <input type="hidden" name="id" value={editing.id} />
                  <Field name="password" label="Senha temporária" type="password" autoComplete="new-password" required />
                  <p className="text-xs text-stone-500">Desbloqueia o acesso e obriga a troca no próximo login. Prefira orientar o usuário a usar “Esqueci minha senha”.</p>
                  <Submit className="btn-ghost">Definir senha temporária</Submit>
                </ActionForm>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
