import { prisma } from "@/lib/prisma";
import { requirePermission, requireUser } from "@/lib/session";
import { runAction, type ActionState } from "@/modules/shared/action";
import { deleteTarget, listTargets, saveTarget } from "@/modules/analytics/sla";
import { SLA_STAGES } from "@/modules/analytics/metrics";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Metas de SLA" };

async function saveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireUser();
  return runAction(async () => {
    await saveTarget(user, { stage: fd.get("stage"), positionId: fd.get("positionId"), departmentName: fd.get("departmentName"), targetDays: fd.get("targetDays") });
    return "Meta salva.";
  }, ["/relatorios", "/relatorios/metas"]);
}
async function deleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireUser();
  return runAction(async () => {
    await deleteTarget(user, String(fd.get("id")));
    return "Meta removida.";
  }, ["/relatorios", "/relatorios/metas"]);
}

export default async function TargetsPage() {
  await requirePermission("relatorios.metas");
  const [targets, positions, depts] = await Promise.all([
    listTargets(),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.department.findMany({ where: { active: true }, distinct: ["name"], orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Metas de SLA" subtitle="Prazo máximo, em dias corridos, de cada etapa. A meta mais específica vale: cargo + departamento › cargo › departamento › padrão da etapa." breadcrumb={{ href: "/relatorios", label: "Relatórios" }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {SLA_STAGES.map((s) => {
            const list = targets.filter((t) => t.stage === s.stage);
            return (
              <Card key={s.stage} title={s.label} actions={<Badge tone={s.owner === "Gestor" ? "gold" : "blue"}>{s.owner}</Badge>}>
                {list.length === 0 ? <p className="text-sm text-stone-500">Nenhuma meta definida — o indicador “na meta” fica sem cálculo.</p> : (
                  <ul className="divide-y divide-stone-100 text-sm">
                    {list.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                        <span>{t.position?.title ?? "Todos os cargos"} · {t.departmentName ?? "todos os departamentos"}{!t.positionId && !t.departmentName && <Badge tone="gray">padrão</Badge>}</span>
                        <span className="flex items-center gap-3"><strong className="tabular-nums">{String(t.targetDays).replace(".", ",")} dia(s)</strong>
                          <ActionForm action={deleteAction}><input type="hidden" name="id" value={t.id} /><Submit className="btn-ghost btn-sm" pendingText="…">Remover</Submit></ActionForm>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
        <Card title="Nova meta (ou alterar existente)">
          <ActionForm action={saveAction} className="space-y-3" resetOnSuccess>
            <div><label className="label" htmlFor="stage">Etapa</label><select id="stage" name="stage" className="input">{SLA_STAGES.map((s) => <option key={s.stage} value={s.stage}>{s.label} ({s.owner})</option>)}</select></div>
            <div><label className="label" htmlFor="positionId">Cargo</label><select id="positionId" name="positionId" className="input"><option value="">Todos os cargos</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
            <div><label className="label" htmlFor="departmentName">Departamento</label><select id="departmentName" name="departmentName" className="input"><option value="">Todos os departamentos</option>{depts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select></div>
            <div><label className="label" htmlFor="targetDays">Meta (dias corridos)</label><input id="targetDays" name="targetDays" type="number" min="0.5" step="0.5" className="input" placeholder="Ex.: 3" /></div>
            <Submit>Salvar meta</Submit>
          </ActionForm>
          <p className="mt-4 text-xs text-stone-500">Dica: comece pela meta padrão de cada etapa e só crie exceções para cargos de liderança ou de difícil reposição.</p>
        </Card>
      </div>
    </>
  );
}
