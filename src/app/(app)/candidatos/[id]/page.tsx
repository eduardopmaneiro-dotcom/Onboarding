import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtDateTime } from "@/lib/datetime";
import { formatMoney, formatPhone } from "@/lib/text";
import { getCandidate, salaryGap } from "@/modules/recruitment/candidates";
import { listJobs } from "@/modules/recruitment/jobs";
import { listReasons } from "@/modules/recruitment/workflow";
import { APP_STATUS_LABEL, APP_STATUS_TONE, BENEFITS, DECISION_LABEL, EXTERNAL_LABEL, RESULT_LABEL, RESULT_TONE, SOURCE_LABEL } from "@/modules/recruitment/constants";
import { ActionForm, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import { ResultPanel } from "@/components/recruitment/result-panel";
import { Badge, Card, PageHeader } from "@/components/ui";
import { addApplicationAction, externalCheckAction, resultAction, saveSalaryAction, updateCandidateAction } from "../../recrutamento/actions";
import { forwardAction } from "../../admissoes/actions";
import { TalentProfile } from "@/components/talent-profile";
import { matchesForCandidate } from "@/modules/career/talent";
import { competencyCatalog } from "@/modules/career/descriptors";
import { fmtDate } from "@/lib/datetime";

export const metadata = { title: "Candidato" };

const EVENT_DOT: Record<string, string> = {
  RESULTADO_RH: "bg-riale-700", DECISAO_GESTOR: "bg-gold-500", ENCAMINHADO_GESTOR: "bg-gold-400", ENTREVISTA_AGENDADA: "bg-stone-400",
  IMPORTACAO: "bg-stone-300", AVALIACAO_EXTERNA: "bg-gold-600", SALARIO: "bg-emerald-600",
};

export default async function CandidatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string; criado?: string }> }) {
  const user = await requirePermission("candidatos.view");
  const { id } = await params;
  const sp = await searchParams;
  const c = await getCandidate(user, id);
  const manage = can(user, "recrutamento.manage");
  const resultPerm = can(user, "entrevistas.resultado");
  const canAdmit = can(user, "admissoes.manage");
  const [reasons, openJobs, positions] = await Promise.all([
    listReasons(),
    manage ? listJobs(user, { status: "ABERTA" }) : Promise.resolve([]),
    sp.editar ? prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const [profile, matches, allPositions, competencyList] = await Promise.all([
    prisma.candidate.findUniqueOrThrow({ where: { id: c.id }, select: { id: true, education: true, competencies: true, experiences: { orderBy: { createdAt: "asc" }, select: { id: true, roleTitle: true, company: true, months: true, position: { select: { title: true } } } } } }),
    matchesForCandidate(user, c.id),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    competencyCatalog(),
  ]);
  const linkable = openJobs.filter((j) => !c.applications.some((a) => a.jobOpeningId === j.id));

  return (
    <>
      <PageHeader
        title={c.fullName}
        subtitle={[formatPhone(c.phone), c.email, `Origem: ${SOURCE_LABEL[c.source]}`, c.desiredPosition && `Cargo pretendido: ${c.desiredPosition.title}`].filter(Boolean).join(" · ")}
        breadcrumb={{ href: "/candidatos", label: "Candidatos" }}
        actions={
          manage && (
            <>
              <Link href="?editar=1" className="btn-ghost">Editar</Link>
              <Link href={`/entrevistas/agendar?candidato=${c.id}${c.applications[0] ? `&vaga=${c.applications[0].jobOpeningId}` : ""}`} className="btn-gold">Agendar entrevista</Link>
            </>
          )
        }
      />
      {sp.criado && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Candidato cadastrado.</p>}

      {sp.editar && manage && (
        <Card title="Editar cadastro" className="mb-6 max-w-3xl" actions={<Link href="?" className="text-xs text-stone-500 hover:underline">fechar</Link>}>
          <ActionForm action={updateCandidateAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            <Field name="fullName" label="Nome completo" defaultValue={c.fullName} className="sm:col-span-2" />
            <Field name="phone" label="Telefone" defaultValue={formatPhone(c.phone) === "—" ? "" : formatPhone(c.phone)} />
            <Field name="email" label="E-mail" type="email" defaultValue={c.email ?? ""} />
            <SelectField name="desiredPositionId" label="Cargo pretendido" placeholder="—" defaultValue={c.desiredPosition?.id ?? ""} options={positions.map((p) => ({ value: p.id, label: p.title }))} />
            <SelectField name="source" label="Origem" defaultValue={c.source} options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} />
            <TextAreaField name="notes" label="Observações" defaultValue={c.notes ?? ""} className="sm:col-span-2" />
            <div className="sm:col-span-2"><Submit>Salvar</Submit></div>
          </ActionForm>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {c.notes && !sp.editar && <Card><p className="whitespace-pre-line text-sm text-stone-600">{c.notes}</p></Card>}
          {c.applications.length === 0 && <Card><p className="text-sm text-stone-500">Candidato sem vaga (banco de talentos).</p></Card>}

          {c.applications.map((a) => {
            const gap = salaryGap(a.offeredSalary, a.expectedSalary);
            const pending = a.interviews.filter((i) => i.result === "PENDENTE" && i.status === "AGENDADA");
            return (
              <Card
                key={a.id}
                title={`${a.jobOpening.position.title} — ${a.jobOpening.department.unit.name}`}
                actions={<div className="flex items-center gap-2"><Link href={`/vagas/${a.jobOpeningId}`} className="font-mono text-[11px] text-stone-400 hover:underline">{a.jobOpening.code}</Link><Badge tone={APP_STATUS_TONE[a.status]}>{APP_STATUS_LABEL[a.status]}</Badge></div>}
              >
                <p className="mb-4 text-xs text-stone-500">{a.jobOpening.department.name} · gestor: {a.jobOpening.requestingManager?.name ?? "não definido"}</p>

                {/* Etapas: resultado do RH × decisão do gestor (separados) */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Entrevistas (RH)</p>
                    <ul className="space-y-2">
                      {a.interviews.map((iv) => (
                        <li key={iv.id} className="rounded-lg border border-stone-200 p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <Link href={`/entrevistas/${iv.id}`} className="font-medium text-riale-900 hover:underline">{iv.stage}ª · {fmtDateTime(iv.scheduledAt, iv.hasTime)}</Link>
                            {iv.status === "CANCELADA" ? <Badge>Cancelada</Badge> : <Badge tone={RESULT_TONE[iv.result]}>{RESULT_LABEL[iv.result]}</Badge>}
                          </div>
                          <p className="text-xs text-stone-500">Entrevistador: {iv.interviewerName ?? iv.interviewerUser?.name ?? "—"}{iv.resultBy ? ` · registrado por ${iv.resultBy.name}` : ""}</p>
                          {iv.reason && <p className="mt-1 text-xs text-red-700">Motivo: {iv.reason.label}</p>}
                          {iv.resultNote && <p className="mt-1 text-xs text-stone-600">{iv.resultNote}</p>}
                        </li>
                      ))}
                      {!a.interviews.length && <li className="text-xs text-stone-400">Nenhuma entrevista ainda.</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Gestor</p>
                    <ul className="space-y-2">
                      {a.managerReviews.map((r) => (
                        <li key={r.id} className="rounded-lg border border-stone-200 p-3 text-sm">
                          <p className="font-medium text-riale-900">{DECISION_LABEL[r.status]}</p>
                          <p className="text-xs text-stone-500">{r.manager?.name ?? "Gestor não definido"} · {r.decidedAt ? fmtDateTime(r.decidedAt) : `desde ${fmtDateTime(r.requestedAt)}`}{r.onBehalf ? ` · registrado por ${r.decidedBy?.name ?? "RH"}` : ""}</p>
                          {r.reason && <p className="mt-1 text-xs text-red-700">Motivo: {r.reason.label}</p>}
                          {r.justification && <p className="mt-1 text-xs text-stone-600">{r.justification}</p>}
                        </li>
                      ))}
                      {!a.managerReviews.length && <li className="text-xs text-stone-400">Encaminhado automaticamente quando o RH aprovar.</li>}
                    </ul>
                    <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Avaliação externa (AGINCO / sindicância)</p>
                    {resultPerm ? (
                      <ActionForm action={externalCheckAction} className="flex gap-2">
                        <input type="hidden" name="applicationId" value={a.id} />
                        <select name="status" defaultValue={a.externalCheckStatus} className="input py-1.5 text-xs">{Object.entries(EXTERNAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <Submit className="btn-ghost btn-sm" pendingText="…">Salvar</Submit>
                      </ActionForm>
                    ) : <p className="text-sm">{EXTERNAL_LABEL[a.externalCheckStatus]}</p>}
                  </div>
                </div>

                {resultPerm && pending.map((iv) => (
                  <div key={iv.id} className="mt-4 rounded-lg bg-riale-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-riale-900">Registrar resultado — {iv.stage}ª entrevista ({fmtDateTime(iv.scheduledAt, iv.hasTime)})</p>
                    <ResultPanel action={resultAction} interviewId={iv.id} reasons={reasons} benefits={BENEFITS} showSalary={c.showSalary} defaultOffer={a.jobOpening.expectedSalary ? Number(a.jobOpening.expectedSalary).toFixed(2).replace(".", ",") : null} />
                  </div>
                ))}

                {a.status === "APROVADO" && (() => {
                  const adm = a.admissions.find((x) => x.status === "EM_ANDAMENTO");
                  return adm ? (
                    <p className="mt-4 rounded-lg border border-gold-400/50 bg-gold-100/40 px-3 py-2 text-sm text-riale-900">Em admissão: <Link href={`/admissoes/${adm.id}`} className="font-mono font-medium underline">{adm.code}</Link></p>
                  ) : canAdmit ? (
                    <ActionForm action={forwardAction} className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <input type="hidden" name="applicationId" value={a.id} />
                      <span className="text-sm text-emerald-900">Aprovado em todas as etapas{a.approvedAt ? ` (${fmtDate(a.approvedAt)})` : ""}.</span>
                      <Submit className="btn-primary btn-sm" pendingText="Abrindo…">Encaminhar para admissão</Submit>
                    </ActionForm>
                  ) : null;
                })()}
                {a.status === "CONTRATADO" && a.hiredAt && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Admitido(a) em {fmtDate(a.hiredAt)}{c.hiredEmployeeId ? <> — <Link href={`/colaboradores/${c.hiredEmployeeId}`} className="font-medium underline">ver colaborador</Link></> : null}.</p>}

                {c.showSalary && (
                  <details className="mt-4 rounded-lg border border-stone-200" open={!!(a.offeredSalary || a.expectedSalary)}>
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Pretensão salarial {gap && <span className={`ml-2 normal-case ${gap.value > 0 ? "text-red-700" : "text-emerald-700"}`}>diferença {gap.value > 0 ? "+" : ""}{formatMoney(gap.value)} ({gap.pct > 0 ? "+" : ""}{gap.pct.toFixed(1)}%)</span>}
                    </summary>
                    <ActionForm action={saveSalaryAction} className="space-y-3 border-t border-stone-100 p-3">
                      <input type="hidden" name="applicationId" value={a.id} />
                      <div className="grid grid-cols-3 gap-2">
                        <Field name="offeredSalary" label="Salário oferecido" inputMode="decimal" defaultValue={a.offeredSalary ? Number(a.offeredSalary).toFixed(2).replace(".", ",") : a.jobOpening.expectedSalary ? Number(a.jobOpening.expectedSalary).toFixed(2).replace(".", ",") : ""} />
                        <Field name="expectedSalary" label="Pretensão" inputMode="decimal" defaultValue={a.expectedSalary ? Number(a.expectedSalary).toFixed(2).replace(".", ",") : ""} />
                        <Field name="lastSalary" label="Último salário" inputMode="decimal" defaultValue={a.lastSalary ? Number(a.lastSalary).toFixed(2).replace(".", ",") : ""} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {BENEFITS.map((b) => (
                          <label key={b} className="cursor-pointer">
                            <input type="checkbox" name="valuedBenefits" value={b} defaultChecked={a.valuedBenefits.includes(b)} className="peer sr-only" />
                            <span className="chip peer-checked:chip-active">{b}</span>
                          </label>
                        ))}
                      </div>
                      {manage && <Submit className="btn-ghost btn-sm">Salvar negociação</Submit>}
                    </ActionForm>
                  </details>
                )}
              </Card>
            );
          })}

          {manage && linkable.length > 0 && (
            <Card title="Vincular a outra vaga">
              <ActionForm action={addApplicationAction} className="flex gap-2">
                <input type="hidden" name="candidateId" value={c.id} />
                <select name="jobOpeningId" className="input">{linkable.map((j) => <option key={j.id} value={j.id}>{j.position.title} — {j.department.unit.name} ({j.code})</option>)}</select>
                <Submit className="btn-ghost">Vincular</Submit>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-6">
        <TalentProfile c={profile} matches={matches} positions={allPositions} competencies={competencyList} manage={manage} />
        <Card title="Histórico">
          <ol className="relative space-y-4 border-l border-stone-200 pl-5">
            {c.events.map((e) => (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${EVENT_DOT[e.type] ?? "bg-stone-300"}`} />
                <p className="text-sm text-stone-800">{e.summary}</p>
                <p className="text-xs text-stone-400">{fmtDateTime(e.occurredAt)} · {e.actorUser?.name ?? e.actorName ?? "Sistema"}{e.actorName && e.actorUser && e.actorName !== e.actorUser.name ? ` (entrevistador: ${e.actorName})` : ""}</p>
              </li>
            ))}
          </ol>
        </Card>
        </div>
      </div>
    </>
  );
}
