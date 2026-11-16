import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDate, fmtDateTime, todayKey } from "@/lib/datetime";
import { formatMoney } from "@/lib/text";
import { getEmployee } from "@/modules/people/service";
import { tenureDays, tenureLabel } from "@/modules/people/rules";
import { DOC_STATUS_LABEL, examSituation, MILESTONE_STATUS_LABEL, OUTCOME_LABEL, TERMINATION_LABEL } from "@/modules/admission/constants";
import { APP_STATUS_LABEL, DECISION_LABEL, RESULT_LABEL, RESULT_TONE, SCHEDULE_LABEL, SHIFT_LABEL } from "@/modules/recruitment/constants";
import { ActionForm, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { milestoneAction, terminateAction } from "../actions";

export const metadata = { title: "Colaborador" };
export const dynamic = "force-dynamic";

const MOVE_LABEL: Record<string, string> = { ADMISSAO: "Admissão", DESLIGAMENTO: "Desligamento" };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ admitido?: string }> }) {
  const user = await requirePermission("colaboradores.view");
  const { id } = await params;
  const sp = await searchParams;
  const e = await getEmployee(user, id);
  const manage = can(user, "colaboradores.manage") && e.status !== "DESLIGADO";
  const today = todayKey();
  const adm = dateKey(e.admissionDate);
  const end = e.terminationDate ? dateKey(e.terminationDate) : today;
  const probEnd = e.probationEndDate ? dateKey(e.probationEndDate) : null;
  const inProbation = !!probEnd && e.status !== "DESLIGADO" && probEnd >= today;

  return (
    <>
      <PageHeader
        title={e.fullName}
        subtitle={`Matrícula ${e.internalId ?? "—"} · ${e.position.title} · ${e.department.name} · ${e.department.unit.name}`}
        breadcrumb={{ href: "/colaboradores", label: "Colaboradores" }}
        actions={e.status === "DESLIGADO" ? <Badge>Desligado</Badge> : inProbation ? <Badge tone="gold">Em experiência até {fmtDate(e.probationEndDate)}</Badge> : <Badge tone="green">Ativo</Badge>}
      />
      {sp.admitido && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Contratação confirmada: o candidato agora é colaborador. Todo o histórico seletivo continua disponível abaixo.</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card title="Vínculo">
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              {[
                ["Admissão", fmtDate(e.admissionDate)],
                ["Tempo de casa", tenureDays(adm, end) === 1 ? "1º dia" : `${tenureLabel(adm, end)} (${tenureDays(adm, end)} dias)`],
                ["Contrato", e.contractType],
                ["Origem", e.origin === "RECRUTAMENTO" ? "Processo seletivo" : "Cadastro direto"],
                ["Cargo", e.position.title],
                ["Departamento", e.department.name],
                ["Unidade", e.department.unit.name],
                ["Gestor", e.manager?.name ?? "—"],
                ["Escala", e.schedule ? SCHEDULE_LABEL[e.schedule] : "—"],
                ["Turno", e.shift ? SHIFT_LABEL[e.shift] : "—"],
                ["Horário", e.workHours ?? "—"],
                ["Salário de admissão", e.showSalary ? formatMoney(e.baseSalary) : "restrito"],
              ].map(([k, v]) => <div key={k}><dt className="text-xs text-stone-500">{k}</dt><dd className="text-riale-900">{v}</dd></div>)}
            </dl>
            {e.status === "DESLIGADO" && (
              <p className="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
                Desligado em {fmtDate(e.terminationDate)} — {e.terminationType && TERMINATION_LABEL[e.terminationType]}{probEnd && end <= probEnd ? " (durante a experiência)" : ""}. {e.terminationReason}
              </p>
            )}
          </Card>

          <Card title="Período de experiência" actions={probEnd && <span className="text-xs text-stone-500">fim em {fmtDate(e.probationEndDate)}</span>}>
            {e.milestones.length === 0 ? <p className="text-sm text-stone-500">{e.contractType !== "CLT" ? "Contrato sem período de experiência." : "Sem marcos (admissão anterior à plataforma)."}</p> : (
              <ul className="space-y-3">
                {e.milestones.map((m) => {
                  const due = dateKey(m.dueDate);
                  const late = m.status === "PENDENTE" && due < today;
                  return (
                    <li key={m.id} className="rounded-lg border border-stone-200 p-3 text-sm" data-milestone={m.days}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-riale-900">{m.days} dias{m.isFinal ? " — fim da experiência" : ""} · {fmtDate(m.dueDate)}</span>
                        <Badge tone={m.status === "REALIZADO" ? (m.outcome === "DESLIGAMENTO" ? "red" : "green") : late ? "red" : "gray"}>{m.status === "REALIZADO" && m.outcome ? OUTCOME_LABEL[m.outcome] : late ? "Atrasado" : MILESTONE_STATUS_LABEL[m.status]}</Badge>
                      </div>
                      {m.notes && <p className="mt-1 text-xs text-stone-600">{m.notes}</p>}
                      {m.doneAt && <p className="text-xs text-stone-400">Registrado em {fmtDateTime(m.doneAt)}</p>}
                      {manage && m.status === "PENDENTE" && (
                        <ActionForm action={milestoneAction} className="mt-3 grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-end">
                          <input type="hidden" name="milestoneId" value={m.id} />
                          <SelectField name="outcome" label="Resultado da avaliação" placeholder="Escolha…" options={(m.isFinal ? ["EFETIVADO", "DESLIGAMENTO"] : ["SEGUE", "DESLIGAMENTO"]).map((o) => ({ value: o, label: OUTCOME_LABEL[o as keyof typeof OUTCOME_LABEL] }))} />
                          <Field name="notes" label="Observações (obrigatório se indicar desligamento)" />
                          <Submit className="btn-primary btn-sm" pendingText="…">Registrar</Submit>
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {e.candidate && (
            <Card title="Histórico seletivo" actions={<Link href={`/candidatos/${e.candidate.id}`} className="text-xs font-medium text-gold-600 hover:underline">cadastro do candidato →</Link>}>
              {e.candidate.applications.map((a) => (
                <div key={a.id} className={`mb-4 rounded-lg border p-3 text-sm ${a.id === e.applicationId ? "border-gold-400" : "border-stone-200"}`}>
                  <p className="font-medium text-riale-900">{a.jobOpening.position.title} — {a.jobOpening.department.name}, {a.jobOpening.department.unit.name} <span className="font-mono text-xs text-stone-400">{a.jobOpening.code}</span> <Badge>{APP_STATUS_LABEL[a.status]}</Badge></p>
                  <ul className="mt-2 space-y-1 text-xs text-stone-600">
                    {a.interviews.map((i) => <li key={i.id}>{i.stage}ª entrevista · {fmtDateTime(i.scheduledAt, i.hasTime)} · {i.interviewerName ?? i.interviewerUser?.name ?? "—"} · <Badge tone={RESULT_TONE[i.result]}>{i.status === "CANCELADA" ? "Cancelada" : RESULT_LABEL[i.result]}</Badge>{i.reason ? ` — ${i.reason.label}` : ""}</li>)}
                    {a.managerReviews.map((r) => <li key={r.id}>Gestor: {DECISION_LABEL[r.status]} · {r.manager?.name ?? "—"} · {fmtDateTime(r.decidedAt ?? r.requestedAt)}{r.justification ? ` — ${r.justification}` : ""}</li>)}
                  </ul>
                </div>
              ))}
              {e.admission && (
                <div className="rounded-lg bg-riale-50 p-3 text-xs text-stone-600">
                  <p className="mb-1 font-semibold text-riale-900">Admissão <Link href={`/admissoes/${e.admission.id}`} className="font-mono font-normal text-gold-600 hover:underline">{e.admission.code}</Link></p>
                  <p>Documentos: {e.admission.documents.filter((d) => d.status === "APROVADO").length} aprovados · {e.admission.documents.filter((d) => d.status !== "APROVADO" && d.status !== "PENDENTE").map((d) => `${d.docType.label}: ${DOC_STATUS_LABEL[d.status].toLowerCase()}`).join(" · ") || "sem pendências registradas"}</p>
                  <p>Exames: {e.admission.exams.map((x) => `${x.clinic.name} ${fmtDate(x.scheduledAt)} — ${examSituation(x).label}`).join(" · ") || "—"}</p>
                </div>
              )}
            </Card>
          )}

          {manage && (
            <Card title="Registrar desligamento">
              <ActionForm action={terminateAction} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="employeeId" value={e.id} />
                <Field name="date" label="Data do desligamento" type="date" defaultValue={today} />
                <SelectField name="type" label="Tipo" placeholder="Escolha…" className="sm:col-span-2" options={Object.entries(TERMINATION_LABEL).map(([value, label]) => ({ value, label }))} />
                <TextAreaField name="reason" label="Motivo" className="sm:col-span-3" />
                <div><Submit className="btn-ghost text-red-700" pendingText="…">Registrar desligamento</Submit></div>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Movimentações">
            <ul className="space-y-2 text-sm">
              {e.movements.map((m) => <li key={m.id}><span className="font-medium text-riale-900">{MOVE_LABEL[m.type] ?? m.type}</span> · {fmtDate(m.effectiveDate)}<span className="block text-xs text-stone-500">{[m.toPosition?.title, m.toDepartment?.name, m.reason].filter(Boolean).join(" · ")} · por {m.recordedBy.name}</span></li>)}
            </ul>
          </Card>
          {e.candidate && (
            <Card title="Histórico completo do candidato">
              <ol className="relative space-y-3 border-l border-stone-200 pl-5">
                {e.candidate.events.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${ev.type === "CONTRATACAO" ? "bg-emerald-600" : ev.type === "ADMISSAO" ? "bg-gold-500" : "bg-stone-300"}`} />
                    <p className="text-sm text-stone-800">{ev.summary}</p>
                    <p className="text-xs text-stone-400">{fmtDateTime(ev.occurredAt)} · {ev.actorUser?.name ?? ev.actorName ?? "Sistema"}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
