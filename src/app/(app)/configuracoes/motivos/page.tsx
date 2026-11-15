import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { runAction, type ActionState } from "@/modules/shared/action";
import { saveReason } from "@/modules/recruitment/reasons";
import { ActionForm, CheckboxField, Field, Submit } from "@/components/forms";
import { Badge, Card, PageHeader, TableWrap } from "@/components/ui";

export const metadata = { title: "Motivos de reprovação" };

async function saveReasonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const { requireUser } = await import("@/lib/session");
  const user = await requireUser();
  const id = (fd.get("id") as string) || undefined;
  return runAction(async () => {
    await saveReason(user, { label: fd.get("label"), requiresNote: fd.get("requiresNote"), active: fd.get("active") }, id);
    return id ? "Motivo atualizado." : "Motivo criado.";
  }, ["/configuracoes/motivos"]);
}

export default async function ReasonsPage() {
  await requirePermission("settings.manage");
  const reasons = await prisma.rejectionReason.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { interviews: true } } } });
  return (
    <>
      <PageHeader title="Motivos de reprovação" subtitle="Lista padronizada usada pelo RH e pelos gestores. Desative em vez de excluir — o histórico continua válido." breadcrumb={{ href: "/configuracoes", label: "Configurações" }} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <TableWrap>
            <table className="table">
              <thead><tr><th>Motivo</th><th>Uso</th><th>Status</th><th>Editar</th></tr></thead>
              <tbody>
                {reasons.map((r) => (
                  <tr key={r.id}>
                    <td><p className="font-medium text-riale-900">{r.label}</p><p className="font-mono text-[10px] text-stone-400">{r.code}{r.requiresNote ? " · exige observação" : ""}</p></td>
                    <td>{r._count.interviews}</td>
                    <td><Badge tone={r.active ? "green" : "gray"}>{r.active ? "Ativo" : "Inativo"}</Badge></td>
                    <td>
                      <ActionForm action={saveReasonAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="label" defaultValue={r.label} className="input py-1 text-xs" />
                        <input type="hidden" name="requiresNote" value={String(r.requiresNote)} />
                        <select name="active" defaultValue={String(r.active)} className="input w-24 py-1 text-xs"><option value="true">Ativo</option><option value="false">Inativo</option></select>
                        <Submit className="btn-ghost btn-sm" pendingText="…">Salvar</Submit>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title="Novo motivo">
          <ActionForm action={saveReasonAction} className="space-y-4" resetOnSuccess>
            <Field name="label" label="Motivo" placeholder="Ex.: Distância / custo de deslocamento" />
            <CheckboxField name="requiresNote" label="Exigir observação ao usar" />
            <Submit>Adicionar</Submit>
          </ActionForm>
          <p className="mt-4 text-xs text-stone-500">Sugestão a partir da planilha atual: “Distância / custo de deslocamento” (3 casos) e “Modalidade de contratação (PJ)” (2 casos) hoje caem em “Outro”.</p>
        </Card>
      </div>
    </>
  );
}
