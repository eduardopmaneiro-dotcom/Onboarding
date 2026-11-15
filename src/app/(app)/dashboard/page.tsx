import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { NAVIGATION } from "@/lib/navigation";
import { ROLE_LABEL } from "@/lib/permissions";
import { unitScope } from "@/modules/shared/scope";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Dashboard" };

const ACTION_LABEL: Record<string, string> = {
  CREATE: "criou", UPDATE: "alterou", STATUS_CHANGE: "alterou status de", LOGIN: "entrou no sistema", LOGIN_FAILED: "falha de login", LOGOUT: "saiu",
  PII_ACCESS: "visualizou CPF de", PERMISSION_CHANGE: "alterou permissão", PASSWORD_RESET: "redefiniu senha", PASSWORD_CHANGE: "trocou a senha",
  PASSWORD_RESET_REQUEST: "pediu recuperação de senha", ACCESS_DENIED: "teve acesso negado", DOCUMENT_UPLOAD: "enviou documento", DOCUMENT_DOWNLOAD: "baixou documento",
};

export default async function Dashboard() {
  const user = await requirePermission("dashboard.view");
  const scope = unitScope(user);
  const deptWhere = scope ? { unitId: scope, active: true } : { active: true };

  const [units, departments, positions, managers, users, deptsWithoutManager, recent] = await Promise.all([
    prisma.unit.count({ where: scope ? { id: scope, active: true } : { active: true } }),
    prisma.department.count({ where: deptWhere }),
    prisma.position.count({ where: { active: true } }),
    prisma.manager.count({ where: { active: true, department: deptWhere } }),
    can(user, "users.view") ? prisma.user.count({ where: { active: true, ...(scope ? { unitId: scope } : {}) } }) : Promise.resolve(null),
    prisma.department.findMany({ where: { ...deptWhere, managers: { none: { active: true } } }, include: { unit: true }, orderBy: [{ unit: { name: "asc" } }, { name: "asc" }], take: 8 }),
    can(user, "audit.view")
      ? prisma.auditLog.findMany({ where: user.role === "ADMIN" ? {} : { OR: [{ actorRole: null }, { actorRole: { not: "ADMIN" } }] }, orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { name: true } } } })
      : Promise.resolve([]),
  ]);

  const modules = NAVIGATION.filter((n) => n.href !== "/dashboard" && user.permissions.has(n.permission));

  return (
    <>
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}`} subtitle={`${ROLE_LABEL[user.role]} · visão ${scope ? "da sua unidade" : "consolidada do grupo"}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Unidades" value={units} />
        <Stat label="Departamentos" value={departments} />
        <Stat label="Cargos (catálogo)" value={positions} />
        <Stat label="Gestores ativos" value={managers} />
        {users !== null && <Stat label="Usuários ativos" value={users} />}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Módulos da plataforma" className="xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((m) => (
              <Link key={m.href} href={m.href} className="rounded-lg border border-slate-200 p-4 transition hover:border-gold-400 hover:shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-riale-900">{m.label}</p>
                  {m.ready ? <Badge tone="green">Disponível</Badge> : <Badge tone="gold">{m.phase?.split(" — ")[0]}</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{m.description}</p>
              </Link>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Departamentos sem gestor">
            {deptsWithoutManager.length === 0 ? (
              <p className="text-sm text-slate-500">Todos os departamentos ativos têm gestor.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {deptsWithoutManager.map((d) => (
                  <li key={d.id} className="flex justify-between">
                    <span className="text-slate-700">{d.name}</span>
                    <span className="text-xs text-slate-400">{d.unit.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {can(user, "managers.manage") && (
              <Link href="/configuracoes/gestores" className="mt-4 inline-block text-xs font-medium text-gold-600 hover:underline">Cadastrar gestores →</Link>
            )}
          </Card>

          {recent.length > 0 && (
            <Card title="Atividade recente">
              <ul className="space-y-3 text-sm">
                {recent.map((r) => (
                  <li key={r.id}>
                    <p className="text-slate-700">
                      <span className="font-medium">{r.actor?.name ?? "Anônimo"}</span> {ACTION_LABEL[r.action] ?? r.action.toLowerCase()}{" "}
                      {!["User", "Auth"].includes(r.entityType) && <span className="text-slate-500">{r.entityType}</span>}
                    </p>
                    <p className="text-xs text-slate-400">{r.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                  </li>
                ))}
              </ul>
              <Link href="/configuracoes/auditoria" className="mt-4 inline-block text-xs font-medium text-gold-600 hover:underline">Ver auditoria completa →</Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
