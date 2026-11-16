import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { fmtDate, todayKey } from "@/lib/datetime";
import { employeeCareer } from "@/modules/career/people";
import { ELIGIBILITY_LABEL, PROMOTION_WEIGHTS, type ScoreKey } from "@/modules/career/rules";
import { MOVE_LABEL } from "@/modules/career/indicators";
import { NOT_AUTOMATIC } from "@/modules/career/constants";
import { ActionForm, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { brl } from "@/components/rem-tabs";
import { movementAction, pdiAction, pdiUpdateAction, scoreAction } from "../../actions";

export const metadata = { title: "Carreira do colaborador" };
export const dynamic = "force-dynamic";

const TONE = { ELEGIVEL: "green", FALTA_AVALIACAO: "gold", NOTA_ABAIXO: "red", FALTA_TEMPO: "gray" } as const;
const MOVES = [["PROMOCAO", "Promoção"], ["MUDANCA_CARGO", "Mudança de cargo (mesmo nível)"], ["TRANSFERENCIA_DEPARTAMENTO", "Transferência de departamento"], ["TRANSFERENCIA_UNIDADE", "Transferência de unidade"], ["MUDANCA_GESTOR", "Troca de gestor"]];

export default async function EmployeeCareerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("carreira.view");
  const { id } = await params;
  const c = await employeeCareer(user, id);
  const e = c.employee;
  const manage = can(user, "carreira.movimentar") && e.status !== "DESLIGADO";
  const [positions, departments, managers, jobs] = manage ? await Promise.all([
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true, level: true } }),
    prisma.department.findMany({ where: { active: true, ...(user.role === "RH" && user.unitId ? { unitId: user.unitId } : {}) }, orderBy: [{ unit: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, unit: { select: { name: true } } } }),
    prisma.manager.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.jobOpening.findMany({ where: { status: { in: ["ABERTA", "PAUSADA"] } }, orderBy: { code: "asc" }, select: { id: true, code: true, position: { select: { title: true } }, department: { select: { unit: { select: { name: true } } } } } }),
  ]) : [[], [], [], []];
  const developable = [...new Set(c.next.flatMap((n) => [...(n.next?.developable ?? []), ...(n.descriptor?.competencies ?? []), ...(n.descriptor?.technicalDevelopable ?? [])]))];

  return (
    <>
      <PageHeader title={e.fullName} subtitle={`Carreira · ${e.position.title} (${e.position.level}) desde ${fmtDate(new Date(`${c.since}T12:00:00-03:00`))} · ${e.department.name} · ${e.department.unit.name}`} breadcrumb={{ href: `/colaboradores/${e.id}`, label: "Ficha do colaborador" }} actions={<Link href={`/carreira/portal/${e.id}`} className="btn-ghost">Prévia do portal do colaborador</Link>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <Card title="Próximos passos nas trilhas vigentes">
            {c.next.length === 0 ? <p className="text-sm text-stone-500">O cargo atual não tem próximo passo em nenhuma trilha vigente.</p> : (
              <ul className="space-y-4">
                {c.next.map((n) => (
                  <li key={n.path.id} className="rounded-lg border border-stone-200 p-4" data-next={n.next!.position.title}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-riale-900">{n.path.name}: {e.position.title} → <Link href={`/cargos/${n.next!.positionId}`} className="hover:underline">{n.next!.position.title}</Link></p>
                      <Badge tone={TONE[n.eligibility.status]}>{ELIGIBILITY_LABEL[n.eligibility.status]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-stone-500">{n.eligibility.monthsInRole} mês(es) no cargo · mínimo {n.eligibility.minMonths}{n.eligibility.missingMonths ? ` (faltam ${n.eligibility.missingMonths})` : ""} · última nota {n.eligibility.score ?? "—"} (mínimo {n.eligibility.minScore}){n.band ? ` · faixa do próximo cargo: ref. ${brl(n.band.ref)}` : ""}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
                      <div className="rounded-md bg-riale-50 p-2"><p className="text-xs font-semibold text-riale-900">Requisitos mínimos</p><ul className="list-disc pl-5 text-xs">{[...(n.next!.requirements), ...(n.descriptor?.minRequirements ?? [])].map((r) => <li key={r}>{r}</li>)}</ul>{!n.next!.requirements.length && !n.descriptor?.minRequirements.length && <p className="text-xs text-stone-400">não cadastrados</p>}</div>
                      <div className="rounded-md bg-gold-100/40 p-2"><p className="text-xs font-semibold text-gold-600">Desenvolver pelo PDI</p><ul className="list-disc pl-5 text-xs">{[...new Set([...n.next!.developable, ...(n.descriptor?.competencies ?? [])])].map((r) => <li key={r}>{r}</li>)}</ul></div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-stone-400">{NOT_AUTOMATIC}</p>
          </Card>

          <Card title="PDI — desenvolvimento">
            <ul className="mb-4 space-y-2 text-sm">
              {c.pdis.map((p) => (
                <li key={p.id} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex justify-between gap-2"><span className="font-medium text-riale-900">{p.gapDescription}</span><Badge tone={p.status === "CONCLUIDO" ? "green" : p.status === "CANCELADO" ? "gray" : "gold"}>{p.status.toLowerCase().replace("_", " ")} · {Math.round(p.completionPct)}%</Badge></div>
                  <p className="text-xs text-stone-500">{p.developmentGoal} — {p.recommendedAction}{p.dueDate ? ` · até ${fmtDate(p.dueDate)}` : ""}</p>
                  {manage && p.status !== "CONCLUIDO" && p.status !== "CANCELADO" && (
                    <ActionForm action={pdiUpdateAction} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <select name="status" defaultValue={p.status} className="input w-auto py-1 text-xs" aria-label="Situação do PDI"><option value="ABERTO">Aberto</option><option value="EM_ANDAMENTO">Em andamento</option><option value="CONCLUIDO">Concluído</option><option value="CANCELADO">Cancelado</option></select>
                      <input name="completionPct" defaultValue={p.completionPct} className="input w-20 py-1 text-xs" aria-label="% concluído" />
                      <Submit className="btn-ghost btn-sm" pendingText="…">Atualizar</Submit>
                    </ActionForm>
                  )}
                </li>
              ))}
              {!c.pdis.length && <li className="text-stone-400">Nenhum item de PDI.</li>}
            </ul>
            {manage && (
              <ActionForm action={pdiAction} resetOnSuccess className="grid gap-2 rounded-lg bg-riale-50 p-3 md:grid-cols-2">
                <input type="hidden" name="employeeId" value={e.id} />
                <div><label className="label" htmlFor="gapDescription">Competência a desenvolver</label><input id="gapDescription" name="gapDescription" list="dev-list" className="input" /><datalist id="dev-list">{developable.map((d) => <option key={d} value={d} />)}</datalist></div>
                <Field name="dueDate" label="Prazo" type="date" />
                <Field name="developmentGoal" label="Objetivo" />
                <Field name="recommendedAction" label="Ação (treinamento, acompanhamento…)" />
                <div><Submit className="btn-primary btn-sm">Criar item do PDI</Submit></div>
              </ActionForm>
            )}
          </Card>

          <Card title="Histórico profissional">
            <ol className="relative space-y-3 border-l border-stone-200 pl-5 text-sm">
              {c.movements.map((m) => (
                <li key={m.id} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold-500 ring-4 ring-white" />
                  <p className="text-stone-800"><span className="font-medium">{m.type === "ADMISSAO" ? "Admissão" : m.type === "DESLIGAMENTO" ? "Desligamento" : MOVE_LABEL[m.type] ?? m.type}</span> · {fmtDate(m.effectiveDate)}{m.toPosition && m.type !== "ALTERACAO_SALARIAL" ? ` · ${m.fromPosition && m.fromPosition.title !== m.toPosition.title ? `${m.fromPosition.title} → ` : ""}${m.toPosition.title}` : ""}{m.toDepartment && m.fromDepartment && m.toDepartment.name !== m.fromDepartment.name ? ` · ${m.fromDepartment.name} → ${m.toDepartment.name}` : ""}{m.jobOpening ? ` · vaga ${m.jobOpening.code}` : ""}</p>
                  <p className="text-xs text-stone-400">{m.reason} · {m.recordedBy.name}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {c.salary && (
            <Card title="Salário na faixa">
              <p className="text-sm">Salário-base {brl(c.salary.base)}{c.salary.band ? ` · faixa ${brl(c.salary.band.min)} – ${brl(c.salary.band.ref)} – ${brl(c.salary.band.max)}` : " · faixa não cadastrada"}</p>
              {c.salary.position && <p className="mt-1 text-xs text-stone-500">Compa-ratio {String(c.salary.position.compa).replace(".", ",")} · {c.salary.position.where === "DENTRO" ? "dentro da faixa" : c.salary.position.where === "ABAIXO" ? "abaixo do mínimo" : "acima do máximo"}{c.salary.position.penetration !== null ? ` · ${String(c.salary.position.penetration).replace(".", ",")}% da amplitude` : ""}</p>}
            </Card>
          )}
          <Card title={`Avaliação de promoção (RH-CAR-01 · mínimo ${c.threshold})`}>
            <ul className="mb-3 space-y-1 text-sm">{c.scores.map((s) => <li key={s.id} className="flex justify-between"><span>{s.cycle}{s.decision ? ` · ${s.decision}` : ""}</span><Badge tone={s.totalScore >= c.threshold ? "green" : "gray"}>{String(s.totalScore).replace(".", ",")}</Badge></li>)}{!c.scores.length && <li className="text-stone-400">Nenhuma avaliação.</li>}</ul>
            {manage && (
              <ActionForm action={scoreAction} resetOnSuccess className="grid grid-cols-2 gap-2 rounded-lg bg-riale-50 p-3">
                <input type="hidden" name="employeeId" value={e.id} />
                <Field name="cycle" label="Ciclo" placeholder="2026-S2" className="col-span-2" />
                {(Object.keys(PROMOTION_WEIGHTS) as ScoreKey[]).map((k) => <Field key={k} name={k} label={`${PROMOTION_WEIGHTS[k].label} (${PROMOTION_WEIGHTS[k].weight}%)`} inputMode="numeric" placeholder="0–100" />)}
                <Field name="decision" label="Decisão do comitê" className="col-span-2" />
                <div className="col-span-2"><Submit className="btn-primary btn-sm">Registrar avaliação</Submit></div>
              </ActionForm>
            )}
          </Card>
          {manage && (
            <Card title="Registrar movimentação interna">
              <ActionForm action={movementAction} className="space-y-3">
                <input type="hidden" name="employeeId" value={e.id} />
                <SelectField name="type" label="Tipo" options={MOVES.map(([value, label]) => ({ value, label }))} />
                <Field name="effectiveDate" label="Data de vigência" type="date" defaultValue={todayKey()} />
                <SelectField name="toPositionId" label="Novo cargo" placeholder="(mantém o atual)" options={positions.map((p) => ({ value: p.id, label: `${p.title} (${p.level})` }))} />
                <SelectField name="toDepartmentId" label="Novo departamento" placeholder="(mantém o atual)" options={departments.map((d) => ({ value: d.id, label: `${d.name} — ${d.unit.name}` }))} />
                <SelectField name="toManagerId" label="Novo gestor" placeholder="(mantém o atual)" options={managers.map((m) => ({ value: m.id, label: m.name }))} />
                {can(user, "remuneracao.manage") && <Field name="newSalary" label="Novo salário-base (opcional)" inputMode="decimal" />}
                {can(user, "remuneracao.manage") && <Field name="bandJustification" label="Justificativa se fora da faixa" />}
                <SelectField name="jobOpeningId" label="Vaga preenchida internamente (opcional)" placeholder="—" options={jobs.map((j) => ({ value: j.id, label: `${j.code} · ${j.position.title} · ${j.department.unit.name}` }))} />
                <TextAreaField name="reason" label="Motivo / decisão" />
                <Submit>Registrar</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
