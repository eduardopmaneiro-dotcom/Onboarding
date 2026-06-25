import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere } from "@/lib/scope";
import Link from "next/link";

export default async function PdiPage() {
  const session = await auth();
  const where = employeeScopeWhere(session!.user);

  const pdis = await prisma.pDI.findMany({
    where: { employee: where },
    include: { employee: true, executor: true, monitor: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">PDI / Plano de Melhoria</h1>
      <p className="mt-1 text-sm text-slate-500">
        Gerado a partir de avaliações de onboarding, feedback de gestor, plano de carreira ou gap identificado pelo RH.
      </p>

      <div className="mt-6 space-y-3">
        {pdis.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <Link href={`/colaboradores/${p.employeeId}`} className="font-medium text-slate-900 hover:underline">
                {p.employee.fullName}
              </Link>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {p.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-medium">Gap:</span> {p.gapDescription}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-medium">Objetivo:</span> {p.developmentGoal}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-medium">Ação:</span> {p.recommendedAction}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Origem: {p.origin.replace(/_/g, " ")} · Executor: {p.executor?.fullName ?? "—"} ·
              Acompanhamento: {p.monitor?.fullName ?? "—"} · Conclusão: {p.completionPct}%
              {p.dueDate ? ` · Prazo: ${p.dueDate.toLocaleDateString("pt-BR")}` : ""}
            </p>
          </div>
        ))}
        {pdis.length === 0 && (
          <p className="text-sm text-slate-400">Nenhum PDI no seu escopo.</p>
        )}
      </div>
    </div>
  );
}
