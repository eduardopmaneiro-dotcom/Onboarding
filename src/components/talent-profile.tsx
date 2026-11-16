import Link from "next/link";
import type { EducationLevel } from "@prisma/client";
import { EDUCATION_LABEL } from "@/modules/career/constants";
import { ActionForm, Field, SelectField, Submit } from "@/components/forms";
import { Badge, Card } from "@/components/ui";
import { experienceAction, profileAction, removeExperienceAction, talentAction } from "@/app/(app)/carreira/actions";

type Match = { positionId: string; title: string; level: "FORTE" | "PARCIAL" | null; evidence: string[]; inPool: boolean; hasDescriptor: boolean };

/** Perfil do candidato (experiências, escolaridade, competências) e cargos compatíveis — base do banco de talentos. */
export function TalentProfile({ c, matches, positions, competencies, manage }: {
  c: { id: string; education: EducationLevel | null; competencies: string[]; experiences: Array<{ id: string; roleTitle: string; company: string | null; months: number | null; position: { title: string } | null }> };
  matches: Match[]; positions: Array<{ id: string; title: string }>; competencies: string[]; manage: boolean;
}) {
  return (
    <Card title="Perfil e potencial">
      <p className="text-xs text-stone-500">Escolaridade: <span className="text-stone-800">{c.education ? EDUCATION_LABEL[c.education] : "não informada"}</span></p>
      <p className="mt-1 text-xs text-stone-500">Competências: {c.competencies.length ? c.competencies.map((x) => <Badge key={x}>{x}</Badge>) : "não informadas"}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {c.experiences.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2"><span>{x.roleTitle}{x.company ? ` · ${x.company}` : ""}{x.months ? ` · ${x.months} meses` : ""}{x.position ? <span className="text-xs text-stone-400"> (≈ {x.position.title})</span> : ""}</span>
            {manage && <ActionForm action={removeExperienceAction}><input type="hidden" name="id" value={x.id} /><Submit className="text-xs text-stone-400 hover:text-red-700" pendingText="…">remover</Submit></ActionForm>}</li>
        ))}
      </ul>
      {manage && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-gold-600">Editar perfil / adicionar experiência</summary>
          <ActionForm action={profileAction} className="mt-2 space-y-2">
            <input type="hidden" name="candidateId" value={c.id} />
            <SelectField name="education" label="Escolaridade" placeholder="—" defaultValue={c.education ?? ""} options={Object.entries(EDUCATION_LABEL).map(([value, label]) => ({ value, label }))} />
            <div><label className="label" htmlFor="competencies">Competências (vírgulas)</label><input id="competencies" name="competencies" list="comp-list" defaultValue={c.competencies.join(", ")} className="input" /><datalist id="comp-list">{competencies.map((x) => <option key={x} value={x} />)}</datalist></div>
            <Submit className="btn-ghost btn-sm">Salvar perfil</Submit>
          </ActionForm>
          <ActionForm action={experienceAction} resetOnSuccess className="mt-3 grid gap-2 border-t border-stone-100 pt-3">
            <input type="hidden" name="candidateId" value={c.id} />
            <Field name="roleTitle" label="Função exercida" />
            <SelectField name="positionId" label="Equivale ao cargo (catálogo)" placeholder="— sem equivalente —" options={positions.map((p) => ({ value: p.id, label: p.title }))} />
            <div className="grid grid-cols-2 gap-2"><Field name="company" label="Empresa" /><Field name="months" label="Meses" inputMode="numeric" /></div>
            <Submit className="btn-ghost btn-sm">Adicionar experiência</Submit>
          </ActionForm>
        </details>
      )}
      <p className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Posições compatíveis na empresa</p>
      {matches.length === 0 ? <p className="text-xs text-stone-400">Sem evidências suficientes. Registre experiências ligadas ao catálogo.</p> : (
        <ul className="space-y-2 text-sm" data-matches>
          {matches.slice(0, 8).map((m) => (
            <li key={m.positionId}>
              <div className="flex items-center justify-between gap-2"><Link href={`/cargos/${m.positionId}`} className="hover:underline">{m.title}</Link><Badge tone={m.level === "FORTE" ? "green" : "gold"}>{m.level === "FORTE" ? "compatível" : "parcial"}</Badge></div>
              <p className="text-[11px] text-stone-500">{m.evidence.join(" · ")}</p>
              {m.inPool ? <p className="text-[11px] text-emerald-700">no banco de talentos</p> : manage && (
                <ActionForm action={talentAction} className="mt-1"><input type="hidden" name="candidateId" value={c.id} /><input type="hidden" name="positionId" value={m.positionId} /><input type="hidden" name="reason" value={m.evidence.join("; ")} /><Submit className="text-[11px] font-medium text-gold-600 hover:underline" pendingText="…">+ banco de talentos</Submit></ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
