import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { dateKey, fmtDate, fmtDateTime, todayKey } from "@/lib/datetime";
import { formatMoney, formatPhone } from "@/lib/text";
import { getJob, jobFormOptions } from "@/modules/recruitment/jobs";
import { matchesForPosition } from "@/modules/career/talent";
import { APP_STATUS_LABEL, APP_STATUS_TONE, DECISION_LABEL, EXTERNAL_LABEL, JOB_STATUS_EDITABLE, JOB_STATUS_LABEL, RESULT_LABEL, RESULT_TONE, SCHEDULE_LABEL, SHIFT_LABEL } from "@/modules/recruitment/constants";
import { ActionForm, Submit } from "@/components/forms";
import { JobForm } from "@/components/recruitment/job-form";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { saveJobAction } from "../../recrutamento/actions";

export const metadata = { title: "Vaga" };

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string; criada?: string }> }) {
  const user = await requirePermission("vagas.view");
  const { id } = await params;
  const sp = await searchParams;
  const job = await getJob(user, id);
  const talent = can(user, "candidatos.view") ? await matchesForPosition(user, job.positionId).then((xs) => xs.filter((m) => !job.applications.some((a) => a.candidateId === m.candidateId))).catch(() => null) : null;
  const manage = can(user, "recrutamento.manage") && !job.isHistorical;
  const status = Object.fromEntries(JOB_STATUS_EDITABLE.map((s) => [s, JOB_STATUS_LABEL[s]]));
  const editing = manage && sp.editar === "1";
  const options = editing ? await jobFormOptions(user) : null;

  const info: Array<[string, string]> = [
    ["Unidade", job.department.unit.name],
    ["Departamento", job.department.name],
    ["Gestor responsável", job.requestingManager?.name ?? "— (defina para encaminhar aprovações)"],
    ["Vagas", String(job.headcount)],
    ["Abertura", fmtDate(job.openedAt)],
    ["Salário previsto", formatMoney(job.expectedSalary)],
    ["Escala", job.schedule ? SCHEDULE_LABEL[job.schedule] : "—"],
    ["Jornada", [job.shift && SHIFT_LABEL[job.shift], job.weeklyHours && `${job.weeklyHours}h semanais`, job.workHours].filter(Boolean).join(" · ") || "—"],
  ];

  return (
    <>
      <PageHeader
        title={job.position.title}
        subtitle={`${job.code} · ${job.department.unit.name} › ${job.department.name}${job.isHistorical ? " · vaga histórica (importada)" : ""}`}
        breadcrumb={{ href: "/vagas", label: "Vagas" }}
        actions={
          manage && (
            <>
              <Link href={`/candidatos/novo?vaga=${job.id}`} className="btn-ghost">+ Candidato</Link>
              <Link href={`/entrevistas/agendar?vaga=${job.id}`} className="btn-gold">Agendar entrevistas</Link>
            </>
          )
        }
      />
      {sp.criada && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Vaga {job.code} criada. Próximo passo: cadastre candidatos ou agende entrevistas.</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card title={`Candidatos (${job.applications.length})`}>
          {job.applications.length === 0 ? (
            <Empty>Nenhum candidato vinculado. {manage && <Link href={`/candidatos/novo?vaga=${job.id}`} className="text-gold-600 underline">Cadastrar candidato</Link>}</Empty>
          ) : (
            <TableWrap>
              <table className="table">
                <thead><tr><th>Candidato</th><th>Última entrevista</th><th>Resultado RH</th><th>Gestor</th><th>Situação</th></tr></thead>
                <tbody>
                  {job.applications.map((a) => {
                    const iv = a.interviews[0];
                    const rv = a.managerReviews[0];
                    return (
                      <tr key={a.id}>
                        <td><Link href={`/candidatos/${a.candidate.id}`} className="font-medium text-riale-900 hover:underline">{a.candidate.fullName}</Link><p className="text-xs text-stone-400">{formatPhone(a.candidate.phone)}</p></td>
                        <td className="text-xs">{iv ? <Link href={`/entrevistas/${iv.id}`} className="hover:underline">{fmtDateTime(iv.scheduledAt, iv.hasTime)}<span className="block text-stone-400">{iv.interviewerName ?? iv.interviewerUser?.name ?? "—"}</span></Link> : "—"}</td>
                        <td>{iv ? <><Badge tone={RESULT_TONE[iv.result]}>{RESULT_LABEL[iv.result]}</Badge>{iv.reason && <p className="mt-1 text-[11px] text-stone-500">{iv.reason.label}</p>}</> : "—"}</td>
                        <td className="text-xs">{rv ? DECISION_LABEL[rv.status] : "—"}{a.externalCheckStatus !== "NAO_APLICA" && <p className="text-[11px] text-gold-600">Aval. externa: {EXTERNAL_LABEL[a.externalCheckStatus]}</p>}</td>
                        <td><Badge tone={APP_STATUS_TONE[a.status]}>{APP_STATUS_LABEL[a.status]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Dados da vaga" actions={manage && !editing && <Link href="?editar=1" className="text-xs font-medium text-gold-600 hover:underline">Editar</Link>}>
            <dl className="space-y-2 text-sm">
              {info.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-stone-500">{k}</dt><dd className="text-right font-medium text-riale-900">{v}</dd></div>)}
            </dl>
            {job.description && <p className="mt-4 whitespace-pre-line border-t border-stone-100 pt-3 text-sm text-stone-600">{job.description}</p>}
          </Card>
          <Card title="Status">
            <p className="mb-3"><Badge tone={job.status === "ABERTA" ? "green" : "gray"}>{JOB_STATUS_LABEL[job.status]}</Badge></p>
            {manage && (
              <ActionForm action={saveJobAction} className="flex gap-2">
                <input type="hidden" name="id" value={job.id} />
                <select name="status" defaultValue={job.status} className="input">{Object.entries(status).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <Submit className="btn-ghost" pendingText="…">Alterar</Submit>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>

      {talent && ["ABERTA", "PAUSADA"].includes(job.status) && (
        <Card title={`Banco de talentos compatível com ${job.position.title} (${talent.length})`} className="mt-6" actions={<Link href={`/banco-de-talentos?cargo=${job.positionId}`} className="text-xs font-medium text-gold-600 hover:underline">abrir banco →</Link>}>
          {talent.length === 0 ? <p className="text-sm text-stone-400">Nenhum candidato com evidência de compatibilidade.</p> : (
            <ul className="divide-y divide-stone-100 text-sm">{talent.slice(0, 6).map((m) => <li key={m.candidateId} className="py-1.5"><Link href={`/candidatos/${m.candidateId}`} className="font-medium text-riale-900 hover:underline">{m.name}</Link> <Badge tone={m.level === "FORTE" ? "green" : "gold"}>{m.level === "FORTE" ? "compatível" : "parcial"}</Badge>{m.pool && <Badge>no banco</Badge>}<span className="block text-xs text-stone-500">{m.evidence.join(" · ")}</span></li>)}</ul>
          )}
          <p className="mt-2 text-[11px] text-stone-400">Para preencher com um colaborador (recrutamento interno), registre a movimentação na carreira dele e escolha esta vaga.</p>
        </Card>
      )}

      {editing && options && (
        <Card title="Editar vaga" className="mt-6 max-w-4xl" actions={<Link href="?" className="text-xs text-stone-500 hover:underline">fechar</Link>}>
          <JobForm
            action={saveJobAction}
            options={options}
            today={todayKey()}
            labels={{ schedule: SCHEDULE_LABEL, shift: SHIFT_LABEL, status }}
            defaults={{
              id: job.id, positionId: job.positionId, unitId: job.department.unitId, departmentId: job.departmentId, requestingManagerId: job.requestingManagerId ?? "",
              headcount: job.headcount, openedAt: job.openedAt ? dateKey(job.openedAt) : undefined, expectedSalary: job.expectedSalary ? Number(job.expectedSalary).toFixed(2).replace(".", ",") : "",
              schedule: job.schedule ?? "", shift: job.shift ?? "", weeklyHours: job.weeklyHours ?? undefined, workHours: job.workHours ?? "", status: job.status, description: job.description ?? "",
            }}
          />
        </Card>
      )}
    </>
  );
}
