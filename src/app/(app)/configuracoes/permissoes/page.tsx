import type { Role } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { ADMIN_LOCKED, ROLE_LABEL, type PermissionCode } from "@/lib/permissions";
import { permissionMatrix } from "@/modules/permissions/service";
import { PermissionToggle } from "@/components/permission-toggle";
import { Card, PageHeader, TableWrap } from "@/components/ui";
import { togglePermissionAction } from "../actions";

export const metadata = { title: "Permissões" };

const ROLES: Role[] = ["ADMIN", "RH", "GESTOR"];

export default async function PermissionsPage() {
  await requirePermission("permissions.manage");
  const matrix = await permissionMatrix();
  return (
    <>
      <PageHeader
        title="Matriz de permissões"
        subtitle="Alterações têm efeito imediato e ficam registradas na auditoria. Regras de escopo (unidade, anti-escalonamento) continuam valendo."
        breadcrumb={{ href: "/configuracoes", label: "Configurações" }}
      />
      <Card>
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>Módulo</th>
                <th>Permissão</th>
                {ROLES.map((r) => <th key={r} className="text-center">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.map((p) => (
                <tr key={p.id}>
                  <td className="text-xs font-medium uppercase tracking-wide text-slate-500">{p.module}</td>
                  <td>
                    <p className="text-slate-800">{p.description}</p>
                    <p className="font-mono text-[11px] text-slate-400">{p.code}</p>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className="text-center">
                      <PermissionToggle
                        label={`${p.code} — ${r}`}
                        granted={p.granted.has(r)}
                        locked={r === "ADMIN" && ADMIN_LOCKED.includes(p.code as PermissionCode)}
                        toggle={togglePermissionAction.bind(null, r, p.code as PermissionCode)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
