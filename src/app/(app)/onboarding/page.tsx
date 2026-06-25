import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere } from "@/lib/scope";
import Link from "next/link";

export default async function OnboardingListPage() {
  const session = await auth();
  const where = employeeScopeWhere(session!.user);

  const processes = await prisma.onboardingProcess.findMany({
    where: { employee: where },
    include: { employee: { include: { unit: true, position: true } } },
    orderBy: { startDate: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Onboarding</h1>
      <p className="mt-1 text-sm text-slate-500">
        Período 1 (D-7 a D45 — adaptação e padronização) e Período 2 (D46 a D90 — produtividade e autonomia).
      </p>
      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Colaborador</th>
              <th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Início</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/colaboradores/${p.employeeId}`} className="font-medium text-slate-900 hover:underline">
                    {p.employee.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2">{p.employee.unit.name}</td>
                <td className="px-4 py-2">{p.startDate.toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-2">{p.status.replace(/_/g, " ")}</td>
              </tr>
            ))}
            {processes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Nenhum onboarding no seu escopo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
