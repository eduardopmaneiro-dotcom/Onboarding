import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere } from "@/lib/scope";

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  const where = employeeScopeWhere(user);

  const [
    totalEmployees,
    inOnboarding,
    activeStages,
    overdueStages,
    openPdis,
    overdueChecklist,
    pendingValidation,
  ] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.count({ where: { ...where, status: "EM_ONBOARDING" } }),
    prisma.onboardingStage.count({
      where: { status: "EM_ANDAMENTO", process: { employee: where } },
    }),
    prisma.onboardingStage.count({
      where: { status: "ATRASADA", process: { employee: where } },
    }),
    prisma.pDI.count({ where: { employee: where, status: { in: ["ABERTO", "EM_ANDAMENTO"] } } }),
    prisma.checklistItem.count({ where: { employee: where, status: "ATRASADO" } }),
    prisma.checklistItem.count({
      where: { employee: where, status: "CONCLUIDO", validatedById: null },
    }),
  ]);

  const byUnit = await prisma.employee.groupBy({
    by: ["unitId"],
    where,
    _count: { _all: true },
  });
  const units = await prisma.unit.findMany();
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? id;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Visão consolidada de onboarding, carreira e execução.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Colaboradores no escopo" value={totalEmployees} />
        <Card label="Em onboarding" value={inOnboarding} />
        <Card label="Etapas em andamento" value={activeStages} />
        <Card label="Etapas atrasadas" value={overdueStages} />
        <Card label="PDIs em aberto" value={openPdis} />
        <Card label="Itens de checklist atrasados" value={overdueChecklist} />
        <Card label="Aguardando validação" value={pendingValidation} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-slate-700">Colaboradores por unidade</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Unidade</th>
                <th className="px-4 py-2">Colaboradores</th>
              </tr>
            </thead>
            <tbody>
              {byUnit.map((row) => (
                <tr key={row.unitId} className="border-t border-slate-100">
                  <td className="px-4 py-2">{unitName(row.unitId)}</td>
                  <td className="px-4 py-2">{row._count._all}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
