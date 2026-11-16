import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { fmtDate, todayKey } from "@/lib/datetime";
import { positionDossier } from "@/modules/career/descriptors";
import { bandFor } from "@/modules/career/people";
import { EDUCATION_LABEL, NOT_AUTOMATIC } from "@/modules/career/constants";
import { ActionForm, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { brl } from "@/components/rem-tabs";
import { descriptorDraftAction, descriptorFileAction, descriptorPublishAction } from "../../carreira/actions";

export const metadata = { title: "Cargo" };
export const dynamic = "force-dynamic";

function List({ title, items, tone, empty }: { title: string; items: string[]; tone?: "must" | "dev"; empty?: string }) {
  return (
    <div>
      <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone === "must" ? "text-riale-900" : tone === "dev" ? "text-gold-600" : "text-stone-500"}`}>{title}</p>
      {items.length ? <ul className="list-disc space-y-0.5 pl-5 text-sm text-stone-700">{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-sm text-stone-400">{empty ?? "—"}</p>}
    </div>
  );
}

export default async function PositionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("carreira.view");
  const { id } = await params;
  const d = await positionDossier(user, id);
  const manage = can(user, "carreira.manage") && (user.role === "ADMIN" || !user.unitId);
  const showSalary = can(user, "remuneracao.view");
  const [positions, band] = await Promise.all([
    prisma.position.findMany({ where: { active: true, id: { not: id } }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    showSalary ? bandFor(id, "__geral__") : Promise.resolve(null),
  ]);
  const cur = d.current, edit = d.draft ?? cur;
  const levelCriteria = d.position.careerTrack?.stages.find((s) => s.level === d.position.level);

  return (
    <>
      <PageHeader title={d.position.title} subtitle={`${d.position.levelConfirmed ? d.position.level : "nível a definir"}${d.position.cbo ? ` · CBO ${d.position.cbo}` : ""} · ${d.position.careerTrack?.name ?? "sem família ocupacional"} · ${d.employees} colaborador(es) ativo(s)`} breadcrumb={{ href: "/cargos", label: "Cargos e carreira" }} actions={<div className="flex gap-2">{d.position.isLeadership && <Badge tone="gold">liderança</Badge>}{cur ? <Badge tone="green">descritivo vigente v{cur.version}</Badge> : <Badge>sem descritivo vigente</Badge>}</div>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card title={cur ? `Descritivo vigente — v${cur.version} desde ${fmtDate(cur.effectiveFrom)}` : "Descritivo"}>
            {!cur ? <p className="text-sm text-stone-500">Nenhum descritivo publicado. {manage ? "Cadastre o rascunho abaixo a partir do documento institucional e publique." : "Aguardando o RH."}</p> : (
              <div className="space-y-5" data-descriptor>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Objetivo do cargo</p><p className="whitespace-pre-line text-sm text-stone-700">{cur.objective}</p></div>
                <List title="Responsabilidades" items={cur.responsibilities} />
                <div className="grid gap-4 rounded-lg border border-riale-200 bg-riale-50/60 p-4 md:grid-cols-2">
                  <div className="md:col-span-2"><p className="text-sm font-semibold text-riale-900">Requisitos mínimos — obrigatórios para ocupar o cargo</p></div>
                  <List title="Requisitos" items={cur.minRequirements} tone="must" empty="Não informados no documento institucional" />
                  <div className="space-y-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-riale-900">Escolaridade</p><p className="text-sm">{cur.education ? EDUCATION_LABEL[cur.education] : "—"}{cur.educationNote ? ` — ${cur.educationNote}` : ""}</p></div>
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-riale-900">Experiência</p><p className="text-sm">{cur.minExperienceMonths !== null ? `${cur.minExperienceMonths} meses` : "—"}{cur.experienceNote ? ` — ${cur.experienceNote}` : ""}</p></div>
                  </div>
                  <List title="Conhecimentos técnicos exigidos" items={cur.technicalRequired} tone="must" />
                </div>
                <div className="grid gap-4 rounded-lg border border-gold-400/40 bg-gold-100/30 p-4 md:grid-cols-2">
                  <div className="md:col-span-2"><p className="text-sm font-semibold text-gold-600">Desenvolvíveis pelo PDI — não impedem a ocupação, orientam o desenvolvimento</p></div>
                  <List title="Competências fundamentais" items={cur.competencies} tone="dev" />
                  <List title="Conhecimentos técnicos a desenvolver" items={cur.technicalDevelopable} tone="dev" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 text-sm">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Superior direto</p>{cur.reportsTo ? <Link href={`/cargos/${cur.reportsTo.id}`} className="text-riale-900 hover:underline">{cur.reportsTo.title}</Link> : "—"}</div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Subordinados</p>{d.subordinates.length ? d.subordinates.map((s) => <Link key={s.id} href={`/cargos/${s.id}`} className="mr-2 text-riale-900 hover:underline">{s.title}</Link>) : <span className="text-stone-400">nenhum descritivo vigente aponta este cargo como superior</span>}</div>
                </div>
                {cur.behavioralProfile && <p className="text-xs text-stone-500">Perfil comportamental (relatório institucional): <span className="font-medium">{cur.behavioralProfile}</span></p>}
                <p className="text-xs text-stone-400">Origem: {cur.sourceRef}</p>
              </div>
            )}
          </Card>

          {manage && (
            <Card title={d.draft ? `Rascunho v${d.draft.version}` : cur ? `Nova versão (v${cur.version + 1})` : "Cadastrar descritivo"} actions={<span className="text-xs text-stone-400">uma linha por item</span>}>
              <ActionForm action={descriptorDraftAction} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="positionId" value={id} />
                <TextAreaField name="objective" label="Objetivo do cargo" defaultValue={edit?.objective ?? ""} className="md:col-span-2" />
                <TextAreaField name="responsibilities" label="Responsabilidades" defaultValue={edit?.responsibilities.join("\n") ?? ""} className="md:col-span-2" />
                <TextAreaField name="minRequirements" label="Requisitos mínimos (obrigatórios)" defaultValue={edit?.minRequirements.join("\n") ?? ""} />
                <TextAreaField name="technicalRequired" label="Conhecimentos técnicos exigidos" defaultValue={edit?.technicalRequired.join("\n") ?? ""} />
                <SelectField name="education" label="Escolaridade mínima" placeholder="—" defaultValue={edit?.education ?? ""} options={Object.entries(EDUCATION_LABEL).map(([value, label]) => ({ value, label }))} />
                <Field name="educationNote" label="Observação da escolaridade" defaultValue={edit?.educationNote ?? ""} />
                <Field name="minExperienceMonths" label="Experiência mínima (meses)" inputMode="numeric" defaultValue={edit?.minExperienceMonths ?? ""} />
                <Field name="experienceNote" label="Tipo de experiência" defaultValue={edit?.experienceNote ?? ""} placeholder="Ex.: recepção de hotel" />
                <TextAreaField name="competencies" label="Competências fundamentais (desenvolvíveis pelo PDI)" defaultValue={edit?.competencies.join("\n") ?? ""} />
                <TextAreaField name="technicalDevelopable" label="Conhecimentos técnicos a desenvolver (PDI)" defaultValue={edit?.technicalDevelopable.join("\n") ?? ""} />
                <SelectField name="reportsToId" label="Superior direto (cargo)" placeholder="—" defaultValue={edit?.reportsToId ?? ""} options={positions.map((p) => ({ value: p.id, label: p.title }))} />
                <Field name="sourceRef" label="Documento institucional de origem" defaultValue={edit?.sourceRef ?? ""} placeholder="Ex.: RH-CAR-02 v.01/2026" />
                <div className="md:col-span-2"><Submit>Salvar rascunho</Submit></div>
              </ActionForm>
              {d.draft && (
                <ActionForm action={descriptorPublishAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4">
                  <input type="hidden" name="positionId" value={id} />
                  <Field name="effectiveFrom" label="Vigência a partir de" type="date" defaultValue={todayKey()} />
                  <Submit className="btn-primary">Publicar como vigente</Submit>
                  <p className="w-full text-xs text-stone-400">Publicar exige objetivo, responsabilidades, requisitos mínimos e o documento de origem. A versão anterior fica no histórico.</p>
                </ActionForm>
              )}
            </Card>
          )}

          {d.versions.length > 1 && (
            <Card title="Histórico de versões">
              <ul className="text-sm">{d.versions.map((v) => <li key={v.id} className="flex justify-between py-1"><span>v{v.version} · {v.sourceRef ?? "sem origem"}</span><Badge tone={v.status === "VIGENTE" ? "green" : v.status === "RASCUNHO" ? "gold" : "gray"}>{v.status.toLowerCase()}{v.effectiveFrom ? ` · ${fmtDate(v.effectiveFrom)}` : ""}</Badge></li>)}</ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Documentos anexados">
            <ul className="mb-3 space-y-1 text-sm">{d.attachments.map((a) => <li key={a.id}><a href={`/api/v1/documents/${a.id}`} className="text-gold-600 hover:underline">📎 {a.originalName}</a> <span className="text-xs text-stone-400">{fmtDate(a.createdAt)}</span></li>)}{!d.attachments.length && <li className="text-stone-400">Nenhum documento.</li>}</ul>
            {manage && (
              <ActionForm action={descriptorFileAction} className="flex items-center gap-2">
                <input type="hidden" name="positionId" value={id} />
                <input type="file" name="file" accept=".pdf,.docx,.jpg,.jpeg,.png" className="max-w-52 text-xs" aria-label="Documento do descritivo" />
                <Submit className="btn-ghost btn-sm" pendingText="Enviando…">Anexar</Submit>
              </ActionForm>
            )}
          </Card>
          {showSalary && (
            <Card title="Faixa salarial (geral)" actions={<Link href="/remuneracao/cargos" className="text-xs text-gold-600 hover:underline">editar faixas →</Link>}>
              {band ? <dl className="grid grid-cols-3 gap-2 text-center text-sm"><div><dt className="text-xs text-stone-500">Mínimo</dt><dd>{brl(band.min)}</dd></div><div><dt className="text-xs text-stone-500">Referência</dt><dd className="font-semibold text-riale-900">{brl(band.ref)}</dd></div><div><dt className="text-xs text-stone-500">Máximo</dt><dd>{brl(band.max)}</dd></div></dl> : <p className="text-sm text-stone-400">Faixa não cadastrada.</p>}
            </Card>
          )}
          <Card title="Nível na família (RH-CAR-01)">
            {levelCriteria ? <p className="text-sm text-stone-700"><span className="font-semibold">{levelCriteria.level}</span> · {levelCriteria.typicalMonths} — {levelCriteria.masteryCriteria}</p> : <p className="text-sm text-stone-400">O RH-CAR-01 não detalha critérios de domínio para {d.position.level} nesta família.</p>}
          </Card>
          <Card title="Trilhas que passam por este cargo">
            {d.paths.length === 0 ? <p className="text-sm text-stone-400">Nenhuma trilha.</p> : d.paths.map((p) => (
              <div key={p.id} className="mb-3 text-sm">
                <Link href={`/carreira?trilha=${p.id}`} className="font-medium text-riale-900 hover:underline">{p.name}</Link> <Badge tone={p.status === "VIGENTE" ? "green" : "gold"}>{p.status.toLowerCase()}</Badge>
                <p className="text-xs text-stone-500">{p.steps.map((s) => (s.positionId === id ? `[${s.position.title}]` : s.position.title)).join(" → ")}</p>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-stone-400">{NOT_AUTOMATIC}</p>
          </Card>
          {can(user, "candidatos.view") && <Card title="Banco de talentos"><Link href={`/banco-de-talentos?cargo=${id}`} className="text-sm text-gold-600 hover:underline">Ver candidatos compatíveis com este cargo →</Link></Card>}
        </div>
      </div>
    </>
  );
}
