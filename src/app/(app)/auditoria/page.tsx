import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function AuditPage() {
  const session = await auth();
  if (!can(session!.user.role, "viewAudit")) redirect("/dashboard");

  const logs = await prisma.auditLog.findMany({
    include: { actor: true, impactedEmployee: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Trilha de Auditoria</h1>
      <p className="mt-1 text-sm text-slate-500">
        Histórico imutável de quem fez o quê, quando e em qual etapa (Módulo I).
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Ação</th>
              <th className="px-4 py-2">Entidade</th>
              <th className="px-4 py-2">Responsável</th>
              <th className="px-4 py-2">Colaborador impactado</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{log.createdAt.toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2">{log.action}</td>
                <td className="px-4 py-2">
                  {log.entityType} · {log.entityId.slice(0, 8)}
                </td>
                <td className="px-4 py-2">
                  {log.actor.name} ({log.actorRole})
                </td>
                <td className="px-4 py-2">{log.impactedEmployee?.fullName ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum evento registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
