import Link from "next/link";
import { CareerLevel } from "@prisma/client";
import { can, requirePermission } from "@/lib/session";
import { listCareerTracks, listPositions } from "@/modules/org/service";
import { isCorporate } from "@/modules/shared/scope";
import { ActionForm, CheckboxField, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import { Badge, Card, PageHeader, StatusBadge, TableWrap } from "@/components/ui";
import { savePositionAction } from "../configuracoes/actions";

export const metadata = { title: "Cargos e carreira" };

export default async function PositionsPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const user = await requirePermission("carreira.view");
  const { editar } = await searchParams;
  const [positions, tracks] = await Promise.all([listPositions(user, { includeInactive: can(user, "org.manage") }), listCareerTracks()]);
  const canEdit = can(user, "org.manage") && isCorporate(user);
  const editing = canEdit ? positions.find((p) => p.id === editar) : undefined;

  return (
    <>
      <PageHeader title="Cargos e carreira" subtitle="Catálogo corporativo único — o mesmo cargo é comparável entre as unidades (base para remuneração e pesquisa salarial)." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title={`Catálogo de cargos (${positions.length})`}>
            <TableWrap>
              <table className="table">
                <thead><tr><th>Cargo</th><th>Nível</th><th>Trilha</th><th>Gestores</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium text-riale-900">
                        {p.title} {p.isLeadership && <Badge tone="gold">liderança</Badge>}
                        {p.code && <p className="font-mono text-[10px] text-slate-400">{p.code}</p>}
                      </td>
                      <td><Badge tone="blue">{p.level}</Badge></td>
                      <td className="text-xs">{p.careerTrack?.name ?? "—"}</td>
                      <td>{p._count.managers}</td>
                      <td><StatusBadge active={p.active} /></td>
                      <td className="text-right">{canEdit && <Link href={`?editar=${p.id}`} className="text-xs font-medium text-gold-600 hover:underline">Editar</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
          <Card title="Trilhas de carreira (RH-CAR-01)">
            <div className="grid gap-4 md:grid-cols-2">
              {tracks.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-riale-900">{t.name}</p>
                    <span className="text-xs text-slate-400">{t._count.positions} cargo(s)</span>
                  </div>
                  {t.stages.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">Critérios de avanço a detalhar na fase de carreira.</p>
                  ) : (
                    <ol className="mt-2 space-y-2">
                      {t.stages.map((s) => (
                        <li key={s.id} className="text-xs text-slate-600">
                          <span className="font-semibold text-riale-700">{s.level}</span> · {s.typicalMonths} — {s.masteryCriteria}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {canEdit && (
          <Card title={editing ? `Editar: ${editing.title}` : "Novo cargo"} actions={editing && <Link href="?" className="text-xs text-slate-500 hover:underline">cancelar</Link>}>
            <ActionForm key={editing?.id ?? "new"} action={savePositionAction} className="space-y-4" resetOnSuccess={!editing}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field name="title" label="Nome do cargo" defaultValue={editing?.title} required />
              <div className="grid grid-cols-2 gap-3">
                <SelectField name="level" label="Nível" defaultValue={editing?.level ?? "N1"} options={Object.values(CareerLevel).map((l) => ({ value: l, label: l }))} />
                <Field name="code" label="Código/CBO" defaultValue={editing?.code ?? ""} />
              </div>
              <SelectField name="careerTrackId" label="Trilha de carreira" placeholder="— Sem trilha —" defaultValue={editing?.careerTrack?.id} options={tracks.map((t) => ({ value: t.id, label: t.name }))} />
              <TextAreaField name="description" label="Descrição" defaultValue={editing?.description ?? ""} />
              <CheckboxField name="isLeadership" label="Cargo de liderança" defaultChecked={editing?.isLeadership} />
              {editing && <CheckboxField name="active" label="Cargo ativo" defaultChecked={editing.active} />}
              <Submit>{editing ? "Salvar alterações" : "Cadastrar cargo"}</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
