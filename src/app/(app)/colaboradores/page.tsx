import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDate, todayKey } from "@/lib/datetime";
import { listEmployees } from "@/modules/people/service";
import { tenureLabel } from "@/modules/people/rules";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";

export const metadata = { title: "Colaboradores" };
export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; unidade?: string; departamento?: string; status?: string; experiencia?: string }> }) {
  const user = await requirePermission("colaboradores.view");
  const sp = await searchParams;
  const status = sp.status ?? "ATIVO";
  const [list, units] = await Promise.all([listEmployees(user, { ...sp, status }), prisma.unit.findMany({ where: { active: true }, orderBy: { name: "asc" } })]);
  const today = todayKey();

  return (
    <>
      <PageHeader
        title="Colaboradores"
        subtitle="Admitidos pela plataforma e cadastrados diretamente. Tempo de casa e experiência calculados automaticamente."
        actions={
          <>
            <Link href="/colaboradores/experiencia" className="btn-ghost">Acompanhamento da experiência</Link>
            {can(user, "colaboradores.manage") && <Link href="/colaboradores/novo" className="btn-gold">Cadastrar colaborador já admitido</Link>}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Nome ou matrícula" className="input w-56 py-1.5 text-sm" />
        {user.role !== "GESTOR" && (
          <select name="unidade" defaultValue={sp.unidade ?? ""} className="input w-auto py-1.5 text-sm" aria-label="Unidade"><option value="">Todas as unidades</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        )}
        <select name="status" defaultValue={status} className="input w-auto py-1.5 text-sm" aria-label="Situação"><option value="ATIVO">Ativos</option><option value="DESLIGADO">Desligados</option><option value="TODOS">Todos</option></select>
        <label className="flex items-center gap-1.5 text-sm text-stone-600"><input type="checkbox" name="experiencia" value="1" defaultChecked={!!sp.experiencia} className="accent-riale-900" /> Só em experiência</label>
        <button className="btn-primary btn-sm">Filtrar</button>
        <span className="ml-auto text-xs text-stone-500">{list.length} colaborador(es)</span>
      </form>
      <Card>
        {list.length === 0 ? <Empty>Nenhum colaborador encontrado.</Empty> : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="bg-riale-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-5 py-2">Nome</th><th className="px-3 py-2">Matrícula</th><th className="px-3 py-2">Cargo</th><th className="px-3 py-2">Departamento / unidade</th><th className="px-3 py-2">Admissão</th><th className="px-3 py-2">Tempo de casa</th><th className="px-5 py-2">Experiência</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((e) => {
                  const end = e.terminationDate ? dateKey(e.terminationDate) : today;
                  const next = e.milestones[0];
                  const inProbation = e.status !== "DESLIGADO" && e.probationEndDate && dateKey(e.probationEndDate) >= today;
                  return (
                    <tr key={e.id} className="hover:bg-riale-50/50">
                      <td className="px-5 py-2.5"><Link href={`/colaboradores/${e.id}`} className="font-medium text-riale-900 hover:underline">{e.fullName}</Link>{e.status === "DESLIGADO" && <span className="ml-2"><Badge>desligado em {fmtDate(e.terminationDate)}</Badge></span>}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{e.internalId ?? "—"}</td>
                      <td className="px-3 py-2.5">{e.position.title}</td>
                      <td className="px-3 py-2.5 text-stone-600">{e.department.name}<span className="block text-xs text-stone-400">{e.department.unit.name}</span></td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtDate(e.admissionDate)}</td>
                      <td className="px-3 py-2.5">{dateKey(e.admissionDate) === end ? "1º dia" : tenureLabel(dateKey(e.admissionDate), end)}</td>
                      <td className="px-5 py-2.5 text-xs">
                        {next ? <span className={dateKey(next.dueDate) < today ? "font-medium text-red-700" : "text-stone-600"}>{next.days} dias: {fmtDate(next.dueDate)}{dateKey(next.dueDate) < today ? " (atrasado)" : ""}</span> : inProbation ? "em experiência" : <span className="text-stone-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
