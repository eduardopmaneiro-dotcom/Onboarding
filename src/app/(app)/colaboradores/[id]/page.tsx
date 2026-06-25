import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere } from "@/lib/scope";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const where = employeeScopeWhere(session!.user);

  const employee = await prisma.employee.findFirst({
    where: { id, ...where },
    include: {
      unit: true,
      department: true,
      position: { include: { careerTrack: true } },
      manager: true,
      buddy: true,
      onboardings: {
        include: { stages: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
      pdis: { orderBy: { createdAt: "desc" } },
      checklistItems: { orderBy: { dueDate: "asc" } },
    },
  });

  if (!employee) notFound();

  const currentOnboarding = employee.onboardings[0];
  const pendingChecklist = employee.checklistItems.filter(
    (c) => c.status !== "CONCLUIDO" && c.status !== "CANCELADO"
  );
  const overdue = pendingChecklist.filter(
    (c) => c.dueDate && c.dueDate < new Date()
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/colaboradores" className="text-sm text-slate-500 hover:underline">
          ← Colaboradores
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{employee.fullName}</h1>
        <p className="text-sm text-slate-500">
          {employee.position.title} · {employee.position.level} · {employee.unit.name} ·{" "}
          {employee.department.name}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Gestor: {employee.manager?.fullName ?? "—"} · Buddy: {employee.buddy?.fullName ?? "—"}
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-slate-700">Status do onboarding</h2>
        {currentOnboarding ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">
              Status: <span className="font-medium">{currentOnboarding.status.replace(/_/g, " ")}</span>
              {" · "}Início: {currentOnboarding.startDate.toLocaleDateString("pt-BR")}
            </p>
            <ul className="mt-3 space-y-2">
              {currentOnboarding.stages.map((stage) => (
                <li key={stage.id} className="flex items-center justify-between text-sm">
                  <span>{stage.name}</span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (stage.status === "CONCLUIDA"
                        ? "bg-emerald-100 text-emerald-700"
                        : stage.status === "ATRASADA"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600")
                    }
                  >
                    {stage.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Sem onboarding registrado.</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700">
          Pendências ({pendingChecklist.length}) · Atrasadas ({overdue.length})
        </h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Prazo</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingChecklist.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{c.title}</td>
                  <td className="px-4 py-2">
                    {c.dueDate ? c.dueDate.toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-2">{c.status}</td>
                </tr>
              ))}
              {pendingChecklist.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-slate-400">
                    Sem pendências.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700">PDI / Plano de melhoria</h2>
        <div className="mt-3 space-y-2">
          {employee.pdis.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <p className="font-medium text-slate-900">{p.developmentGoal}</p>
              <p className="mt-1 text-slate-600">{p.gapDescription}</p>
              <p className="mt-1 text-xs text-slate-400">
                Origem: {p.origin.replace(/_/g, " ")} · Status: {p.status} · Conclusão: {p.completionPct}%
              </p>
            </div>
          ))}
          {employee.pdis.length === 0 && (
            <p className="text-sm text-slate-400">Nenhum PDI registrado.</p>
          )}
        </div>
      </section>
    </div>
  );
}
