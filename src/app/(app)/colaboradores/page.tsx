import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere } from "@/lib/scope";
import Link from "next/link";

export default async function EmployeesPage() {
  const session = await auth();
  const where = employeeScopeWhere(session!.user);

  const employees = await prisma.employee.findMany({
    where,
    include: { unit: true, department: true, position: true },
    orderBy: { fullName: "asc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Colaboradores</h1>
      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Cargo</th>
              <th className="px-4 py-2">Nível</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/colaboradores/${e.id}`} className="font-medium text-slate-900 hover:underline">
                    {e.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2">{e.unit.name}</td>
                <td className="px-4 py-2">{e.position.title}</td>
                <td className="px-4 py-2">{e.position.level}</td>
                <td className="px-4 py-2">{e.status.replace(/_/g, " ")}</td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum colaborador no seu escopo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
