import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { fmtDate } from "@/lib/datetime";
import { milestoneAgenda } from "@/modules/people/service";
import { currentRule } from "@/modules/people/rule-settings";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Acompanhamento da experiência" };
export const dynamic = "force-dynamic";

export default async function ProbationPage() {
  const user = await requirePermission("colaboradores.view");
  const [rows, rule] = await Promise.all([milestoneAgenda(user, 45), currentRule()]);
  const groups = [
    { title: "Em atraso", items: rows.filter((r) => r.overdue) },
    { title: `Vencem nos próximos ${rule.leadDays} dias`, items: rows.filter((r) => r.dueSoon) },
    { title: "Próximas semanas", items: rows.filter((r) => !r.overdue && !r.dueSoon) },
  ];
  return (
    <>
      <PageHeader title="Acompanhamento da experiência" subtitle={`Marcos de ${rule.milestones.join(", ")} dias ${rule.countAdmissionDay ? "(o dia da admissão é o 1º dia)" : ""}. O RH recebe alerta ${rule.leadDays} dia(s) antes e no dia de cada marco.`} breadcrumb={{ href: "/colaboradores", label: "Colaboradores" }} />
      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g.title} title={`${g.title} (${g.items.length})`}>
            {g.items.length === 0 ? <Empty>Nada aqui.</Empty> : (
              <ul className="divide-y divide-stone-100">
                {g.items.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <Link href={`/colaboradores/${m.employee.id}`} className="font-medium text-riale-900 hover:underline">{m.employee.fullName}</Link>
                      <span className="block text-xs text-stone-500">{m.employee.position.title} · {m.employee.department.name} · {m.employee.department.unit.name}{m.employee.manager ? ` · gestor(a) ${m.employee.manager.name}` : ""} · admitido em {fmtDate(m.employee.admissionDate)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={m.overdue ? "red" : m.dueSoon ? "gold" : "gray"}>{m.days} dias{m.isFinal ? " (fim)" : ""} · {fmtDate(m.dueDate)}</Badge>
                      <Link href={`/colaboradores/${m.employee.id}`} className="btn-primary btn-sm">Avaliar</Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
