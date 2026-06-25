import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere } from "@/lib/scope";
import { can } from "@/lib/rbac";
import { completeChecklistItem, validateChecklistItem } from "./actions";

export default async function ChecklistsPage() {
  const session = await auth();
  const user = session!.user;
  const where = employeeScopeWhere(user);

  const items = await prisma.checklistItem.findMany({
    where: { employee: where, status: { not: "CANCELADO" } },
    include: { employee: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 200,
  });

  const canValidate = can(user.role, "validateChecklist");

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Checklists</h1>
      <p className="mt-1 text-sm text-slate-500">
        Itens de onboarding, carreira e PDI no seu escopo.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">Colaborador</th>
              <th className="px-4 py-2">Origem</th>
              <th className="px-4 py-2">Prazo</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{item.title}</td>
                <td className="px-4 py-2">{item.employee.fullName}</td>
                <td className="px-4 py-2">{item.origin.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">
                  {item.dueDate ? item.dueDate.toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-2">{item.status}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    {item.status !== "CONCLUIDO" && (
                      <form action={async () => { await completeChecklistItem(item.id); }}>
                        <button className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white">
                          Concluir
                        </button>
                      </form>
                    )}
                    {canValidate && item.status === "CONCLUIDO" && !item.validatedById && (
                      <form action={async () => { await validateChecklistItem(item.id); }}>
                        <button className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700">
                          Validar
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum item de checklist no seu escopo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
