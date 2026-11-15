import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDateTime, timeKey } from "@/lib/datetime";
import { formatPhone } from "@/lib/text";
import { getInterview, listInterviewers, listReasons } from "@/modules/recruitment/workflow";
import { BENEFITS, DECISION_LABEL, EXTERNAL_LABEL, RESULT_LABEL, RESULT_TONE } from "@/modules/recruitment/constants";
import { ActionForm, Submit } from "@/components/forms";
import { ResultPanel } from "@/components/recruitment/result-panel";
import { Badge, Card, PageHeader } from "@/components/ui";
import { cancelInterviewAction, rescheduleAction, resultAction } from "../../recrutamento/actions";

export const metadata = { title: "Entrevista" };

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("entrevistas.view");
  const { id } = await params;
  const iv = await getInterview(user, id);
  const [reasons, interviewers] = await Promise.all([listReasons(), listInterviewers()]);
  const job = iv.application.jobOpening;
  const editable = iv.status !== "CANCELADA";
  const info: Array<[string, string]> = [
    ["Vaga", `${job.position.title} (${job.code})`],
    ["Unidade", job.department.unit.name],
    ["Departamento", job.department.name],
    ["Gestor responsável", job.requestingManager?.name ?? "—"],
    ["Entrevistador", iv.interviewerName ?? "—"],
    ["Etapa", `${iv.stage}ª entrevista`],
    ["Local", iv.location ?? "—"],
  ];

  return (
    <>
      <PageHeader
        title={iv.application.candidate.fullName}
        subtitle={`Entrevista em ${fmtDateTime(iv.scheduledAt, iv.hasTime)} · ${formatPhone(iv.application.candidate.phone)}`}
        breadcrumb={{ href: `/entrevistas?visao=dia&data=${dateKey(iv.scheduledAt)}`, label: "Agenda" }}
        actions={<Link href={`/candidatos/${iv.application.candidateId}`} className="btn-ghost">Ficha do candidato</Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Resultado do RH">
          {iv.status === "CANCELADA" ? <p className="text-sm text-stone-500">Entrevista cancelada.</p> : (
            <>
              {iv.result !== "PENDENTE" && (
                <div className="mb-4 rounded-lg bg-riale-50 p-3 text-sm">
                  <Badge tone={RESULT_TONE[iv.result]}>{RESULT_LABEL[iv.result]}</Badge>
                  {iv.reason && <span className="ml-2 text-red-700">{iv.reason.label}</span>}
                  {iv.resultNote && <p className="mt-2 text-stone-600">{iv.resultNote}</p>}
                  <p className="mt-1 text-xs text-stone-400">Registrado {iv.resultBy ? `por ${iv.resultBy.name}` : ""} em {fmtDateTime(iv.resultAt)}</p>
                  {can(user, "entrevistas.resultado") && <p className="mt-2 text-xs text-stone-500">Para corrigir, registre novamente abaixo — a alteração fica no histórico.</p>}
                </div>
              )}
              {can(user, "entrevistas.resultado") && (
                <ResultPanel
                  action={resultAction}
                  interviewId={iv.id}
                  reasons={reasons}
                  benefits={BENEFITS}
                  showSalary={can(user, "recrutamento.salarios")}
                  current={{ result: iv.result, reasonId: iv.reasonId, note: iv.resultNote }}
                  defaultOffer={job.expectedSalary ? Number(job.expectedSalary).toFixed(2).replace(".", ",") : null}
                />
              )}
            </>
          )}
          <div className="mt-6 border-t border-stone-100 pt-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Gestor</p>
            {iv.application.managerReviews.length === 0 ? <p className="text-stone-400">Será encaminhado automaticamente quando o RH aprovar.</p> : iv.application.managerReviews.map((r) => (
              <p key={r.id}>{DECISION_LABEL[r.status]} {r.manager && `— ${r.manager.name}`}{r.justification && <span className="block text-xs text-stone-500">{r.justification}</span>}</p>
            ))}
            {iv.application.externalCheckStatus !== "NAO_APLICA" && <p className="mt-2 text-xs text-gold-600">Avaliação externa: {EXTERNAL_LABEL[iv.application.externalCheckStatus]}</p>}
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Dados">
            <dl className="space-y-2 text-sm">{info.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-stone-500">{k}</dt><dd className="text-right font-medium text-riale-900">{v}</dd></div>)}</dl>
          </Card>
          {editable && iv.result === "PENDENTE" && can(user, "recrutamento.manage") && (
            <Card title="Remarcar ou cancelar">
              <ActionForm action={rescheduleAction} className="space-y-2">
                <input type="hidden" name="interviewId" value={iv.id} />
                <div className="grid grid-cols-2 gap-2"><input type="date" name="date" defaultValue={dateKey(iv.scheduledAt)} className="input" /><input type="time" name="time" defaultValue={iv.hasTime ? timeKey(iv.scheduledAt) : "09:00"} className="input" /></div>
                <select name="interviewerUserId" defaultValue={iv.interviewerUserId ?? ""} className="input"><option value="">Manter entrevistador</option>{interviewers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                <Submit className="btn-ghost w-full">Remarcar</Submit>
              </ActionForm>
              <ActionForm action={cancelInterviewAction} className="mt-4 space-y-2 border-t border-stone-100 pt-4">
                <input type="hidden" name="interviewId" value={iv.id} />
                <input name="note" className="input" placeholder="Motivo do cancelamento (opcional)" />
                <Submit className="btn-ghost w-full text-red-700">Cancelar entrevista</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
