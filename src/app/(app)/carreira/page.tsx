import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { listPaths } from "@/modules/career/paths";
import { bandFor } from "@/modules/career/people";
import { getSetting } from "@/modules/settings/service";
import { NOT_AUTOMATIC } from "@/modules/career/constants";
import { ActionForm, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { brl } from "@/components/rem-tabs";
import { careerPolicyAction, draftFromFamilyAction, moveStepAction, pathAction, pathStatusAction, removeStepAction, stepAction } from "./actions";

export const metadata = { title: "Trilhas de carreira" };
export const dynamic = "force-dynamic";

type Path = Awaited<ReturnType<typeof listPaths>>[number];

/** Representação visual: cargos em sequência, com requisitos para chegar a cada um. */
async function Flow({ p, showSalary }: { p: Path; showSalary: boolean }) {
  const bands = showSalary ? await Promise.all(p.steps.map((s) => bandFor(s.positionId, "__geral__"))) : [];
  return (
    <ol className="flex flex-wrap items-stretch gap-y-3" aria-label={`Trilha ${p.name}`} data-path={p.name}>
      {p.steps.map((s, i) => (
        <li key={s.id} className="flex items-stretch">
          {i > 0 && <span className="flex items-center px-1.5 text-xl text-gold-500" aria-hidden>→</span>}
          <div className="w-52 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-1">
              <Link href={`/cargos/${s.positionId}`} className="font-medium leading-tight text-riale-900 hover:underline">{s.position.title}</Link>
              <Badge tone={s.position.isLeadership ? "gold" : "blue"}>{s.position.levelConfirmed ? s.position.level : "nível ?"}</Badge>
            </div>
            <p className="mt-1 text-[11px] text-stone-500">{s.position._count.employees} colaborador(es){showSalary && bands[i] ? ` · ref. ${brl(bands[i]!.ref)}` : ""}</p>
            {i > 0 && (
              <div className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-[11px]">
                <p className="text-stone-600">{s.minMonths !== null ? `${s.minMonths} meses no cargo anterior` : "tempo mínimo não definido"}{s.minScore !== null ? ` · nota ≥ ${s.minScore}` : ""}</p>
                {s.requirements.length > 0 && <p className="text-riale-900"><span className="font-semibold">Requisitos mínimos:</span> {s.requirements.join("; ")}</p>}
                {s.developable.length > 0 && <p className="text-gold-600"><span className="font-semibold">Desenvolver (PDI):</span> {s.developable.join("; ")}</p>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function CareerPage({ searchParams }: { searchParams: Promise<{ trilha?: string }> }) {
  const user = await requirePermission("carreira.view");
  const sp = await searchParams;
  const manage = can(user, "carreira.manage") && (user.role === "ADMIN" || !user.unitId);
  const showSalary = can(user, "remuneracao.view");
  const [paths, families, positions, minScore, portal] = await Promise.all([
    listPaths(user, { includeDrafts: manage }),
    prisma.careerTrack.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { _count: { select: { positions: true } } } }),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true, level: true } }),
    getSetting("carreira.nota_minima"), getSetting("portal.faixa_salarial"),
  ]);
  const selected = paths.find((p) => p.id === sp.trilha);
  const vigentes = paths.filter((p) => p.status === "VIGENTE"), rascunhos = paths.filter((p) => p.status === "RASCUNHO");

  return (
    <>
      <PageHeader title="Trilhas de carreira" subtitle="Possibilidades de progressão entre cargos, configuradas conforme a estrutura real e os documentos institucionais." actions={<><Link href="/cargos" className="btn-ghost">Cargos e descritivos</Link><Link href="/carreira/indicadores" className="btn-ghost">Indicadores</Link></>} />
      <p className="mb-6 rounded-lg bg-gold-100/40 px-4 py-2 text-sm text-stone-700">{NOT_AUTOMATIC}</p>

      <div className="space-y-6">
        {vigentes.length === 0 && <Card><p className="text-sm text-stone-500">Nenhuma trilha vigente. {manage ? "Cadastre a partir do documento institucional (ou gere um rascunho pela família e valide) e publique." : "Aguardando o RH publicar as trilhas."}</p></Card>}
        {vigentes.map((p) => (
          <Card key={p.id} title={p.name} actions={<div className="flex items-center gap-2">{p.family && <Badge>{p.family.name}</Badge>}<Badge tone="green">vigente</Badge>{manage && <Link href={`?trilha=${p.id}`} className="text-xs text-gold-600 hover:underline">editar</Link>}</div>}>
            <Flow p={p} showSalary={showSalary} />
            {p.description && <p className="mt-3 text-xs text-stone-500">{p.description}</p>}
            <p className="mt-1 text-[11px] text-stone-400">Origem: {p.sourceRef}</p>
          </Card>
        ))}
        {manage && rascunhos.length > 0 && (
          <Card title={`Rascunhos (${rascunhos.length}) — não aparecem para colaboradores nem nos indicadores`}>
            <ul className="space-y-2 text-sm">{rascunhos.map((p) => <li key={p.id}><Link href={`?trilha=${p.id}`} className="font-medium text-riale-900 hover:underline">{p.name}</Link> <span className="text-xs text-stone-500">{p.steps.map((s) => s.position.title).join(" → ")}</span></li>)}</ul>
          </Card>
        )}

        {manage && selected && (
          <Card title={`Editar trilha: ${selected.name}`} actions={<Link href="/carreira" className="text-xs text-stone-500 hover:underline">fechar</Link>}>
            <div className="mb-4 rounded-lg bg-riale-50 p-3"><Flow p={selected} showSalary={showSalary} /></div>
            <ActionForm action={pathAction} className="mb-5 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={selected.id} />
              <Field name="name" label="Nome" defaultValue={selected.name} />
              <SelectField name="familyId" label="Família ocupacional" placeholder="—" defaultValue={selected.family?.id ?? ""} options={families.map((f) => ({ value: f.id, label: f.name }))} />
              <Field name="sourceRef" label="Documento institucional (obrigatório para publicar)" defaultValue={selected.sourceRef ?? ""} />
              <Field name="description" label="Descrição" defaultValue={selected.description ?? ""} />
              <div><Submit className="btn-ghost btn-sm">Salvar dados da trilha</Submit></div>
            </ActionForm>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Passos (cargo e requisitos para chegar a ele)</p>
            <ul className="space-y-3">
              {selected.steps.map((s, i) => (
                <li key={s.id} className="rounded-lg border border-stone-200 p-3" data-step={s.position.title}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-riale-900">{i + 1}. {s.position.title} <Badge tone="blue">{s.position.level}</Badge></span>
                    <span className="flex gap-1">
                      {i > 0 && <ActionForm action={moveStepAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><Submit className="btn-ghost btn-sm" pendingText="…">↑</Submit></ActionForm>}
                      {i < selected.steps.length - 1 && <ActionForm action={moveStepAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><Submit className="btn-ghost btn-sm" pendingText="…">↓</Submit></ActionForm>}
                      <ActionForm action={removeStepAction}><input type="hidden" name="id" value={s.id} /><Submit className="btn-ghost btn-sm text-red-700" pendingText="…">remover</Submit></ActionForm>
                    </span>
                  </div>
                  {i > 0 && (
                    <ActionForm action={stepAction} className="grid gap-2 md:grid-cols-4">
                      <input type="hidden" name="id" value={s.id} /><input type="hidden" name="pathId" value={selected.id} /><input type="hidden" name="positionId" value={s.positionId} />
                      <Field name="minMonths" label="Meses mínimos no cargo anterior" inputMode="numeric" defaultValue={s.minMonths ?? ""} />
                      <Field name="minScore" label={`Nota mínima (vazio = ${minScore})`} inputMode="numeric" defaultValue={s.minScore ?? ""} />
                      <TextAreaField name="requirements" label="Requisitos mínimos de progressão" defaultValue={s.requirements.join("\n")} />
                      <TextAreaField name="developable" label="Competências a desenvolver (PDI)" defaultValue={s.developable.join("\n")} />
                      <div className="md:col-span-4"><Submit className="btn-ghost btn-sm">Salvar passo</Submit></div>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <ActionForm action={stepAction} resetOnSuccess className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="pathId" value={selected.id} />
              <SelectField name="positionId" label="Adicionar cargo ao fim" placeholder="Escolha…" options={positions.filter((p) => !selected.steps.some((s) => s.positionId === p.id)).map((p) => ({ value: p.id, label: `${p.title} (${p.level})` }))} />
              <Submit className="btn-ghost btn-sm">Adicionar</Submit>
            </ActionForm>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
              {selected.status !== "VIGENTE" && <ActionForm action={pathStatusAction}><input type="hidden" name="id" value={selected.id} /><input type="hidden" name="status" value="VIGENTE" /><Submit className="btn-primary" pendingText="…">Publicar como vigente</Submit></ActionForm>}
              {selected.status === "VIGENTE" && <ActionForm action={pathStatusAction}><input type="hidden" name="id" value={selected.id} /><input type="hidden" name="status" value="RASCUNHO" /><Submit className="btn-ghost" pendingText="…">Voltar para rascunho</Submit></ActionForm>}
              <ActionForm action={pathStatusAction}><input type="hidden" name="id" value={selected.id} /><input type="hidden" name="status" value="ARQUIVADO" /><Submit className="btn-ghost text-red-700" pendingText="…">Arquivar</Submit></ActionForm>
            </div>
          </Card>
        )}

        {manage && (
          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Nova trilha">
              <ActionForm action={pathAction} className="space-y-3">
                <Field name="name" label="Nome" placeholder="Ex.: Recepção" />
                <SelectField name="familyId" label="Família ocupacional" placeholder="—" options={families.map((f) => ({ value: f.id, label: f.name }))} />
                <Field name="sourceRef" label="Documento institucional" />
                <Submit>Criar trilha</Submit>
              </ActionForm>
            </Card>
            <Card title="Rascunho a partir do catálogo">
              <p className="mb-3 text-xs text-stone-500">Ordena os cargos da família pelo nível (N1→N7). É só ponto de partida: fica como rascunho até o RH validar com o documento institucional.</p>
              <ActionForm action={draftFromFamilyAction} className="space-y-3">
                <SelectField name="familyId" label="Família" placeholder="Escolha…" options={families.map((f) => ({ value: f.id, label: `${f.name} (${f._count.positions} cargos)` }))} />
                <Submit className="btn-ghost">Gerar rascunho</Submit>
              </ActionForm>
            </Card>
            <Card title="Política de carreira">
              <ActionForm action={careerPolicyAction} className="space-y-3">
                <Field name="carreira.nota_minima" label="Nota mínima de promoção (RH-CAR-01)" type="number" defaultValue={minScore} />
                <SelectField name="portal.faixa_salarial" label="Portal do colaborador: faixa salarial" defaultValue={portal} options={[{ value: "NAO_EXIBIR", label: "Não exibir" }, { value: "REFERENCIA", label: "Só o salário de referência" }, { value: "FAIXA", label: "Faixa completa (mínimo, referência, máximo)" }]} />
                <Submit>Salvar</Submit>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
