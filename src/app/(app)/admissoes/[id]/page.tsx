import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dateKey, fmtDate, fmtDateTime, todayKey } from "@/lib/datetime";
import { formatMoney } from "@/lib/text";
import { getAdmission, isApplicable, isRequired } from "@/modules/admission/service";
import { listClinics } from "@/modules/admission/config";
import { ADMISSION_STATUS_LABEL, ADMISSION_STATUS_TONE, CANCEL_REASON_LABEL, DOC_CATEGORIES, DOC_STATUS_LABEL, DOC_STATUS_TONE, EXAM_RESULT_LABEL, examSituation } from "@/modules/admission/constants";
import { SCHEDULE_LABEL, SHIFT_LABEL } from "@/modules/recruitment/constants";
import { ActionForm, CheckboxField, CpfField, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { attachAction, cancelAction, confirmAction, docStatusAction, scheduleExamAction, updateAdmissionAction, updateExamAction } from "../actions";

export const metadata = { title: "Admissão" };
export const dynamic = "force-dynamic";

const money = (v: unknown) => (v ? Number(v).toFixed(2).replace(".", ",") : "");

export default async function AdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("admissoes.view");
  const { id } = await params;
  const a = await getAdmission(user, id);
  const open = a.status === "EM_ANDAMENTO";
  const manage = open && can(user, "admissoes.manage");
  const [positions, departments, managers, clinics, events] = await Promise.all([
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.department.findMany({ where: { active: true, ...(user.role === "RH" && user.unitId ? { unitId: user.unitId } : {}) }, orderBy: [{ unit: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, unit: { select: { name: true } } } }),
    prisma.manager.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, department: { select: { name: true } } } }),
    listClinics(),
    prisma.candidateEvent.findMany({ where: { candidateId: a.candidateId }, orderBy: { occurredAt: "asc" }, include: { actorUser: { select: { name: true } } } }),
  ]);
  const byCat = Object.entries(DOC_CATEGORIES).map(([cat, label]) => ({ cat, label, docs: a.documents.filter((d) => d.docType.category === cat && (d.docType.active || d.status !== "PENDENTE")) })).filter((g) => g.docs.length);
  const filesOf = (ownerId: string) => a.attachments.filter((f) => f.ownerId === ownerId);
  const openExam = a.exams.find((e) => e.status === "AGENDADO");
  const today = todayKey();

  return (
    <>
      <PageHeader
        title={a.candidate.fullName}
        subtitle={`${a.code} · ${a.position.title} · ${a.department.name} · ${a.department.unit.name}`}
        breadcrumb={{ href: "/admissoes", label: "Admissões" }}
        actions={<div className="flex items-center gap-2"><Link href={`/candidatos/${a.candidateId}`} className="btn-ghost">Histórico seletivo</Link><Badge tone={ADMISSION_STATUS_TONE[a.status]}>{ADMISSION_STATUS_LABEL[a.status]}</Badge></div>}
      />

      {a.status === "CONCLUIDA" && a.employee && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Contratação confirmada em {fmtDateTime(a.completedAt)} — <Link href={`/colaboradores/${a.employee.id}`} className="font-medium underline">colaborador, matrícula {a.employee.internalId}</Link>.</p>
      )}
      {a.status === "CANCELADA" && (
        <p className="mb-4 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">Cancelado em {fmtDateTime(a.canceledAt)}: {a.cancelReason && CANCEL_REASON_LABEL[a.cancelReason]}{a.cancelNote ? ` — ${a.cancelNote}` : ""}.</p>
      )}

      {open && (
        <Card className="mb-6" title={a.missing.length ? `Faltam ${a.missing.length} item(ns) para confirmar a contratação` : "Tudo pronto para confirmar a contratação"}>
          {a.missing.length > 0 ? (
            <ul className="grid gap-1 text-sm text-stone-700 sm:grid-cols-2">{a.missing.map((m) => <li key={m} className="flex gap-2"><span className="text-gold-600">○</span>{m}</li>)}</ul>
          ) : <p className="text-sm text-stone-600">Documentos obrigatórios aprovados, ASO apto e dados da admissão completos. Ao confirmar, o candidato vira colaborador — o histórico seletivo continua ligado ao cadastro.</p>}
          {manage && (
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <ActionForm action={confirmAction}>
                <input type="hidden" name="id" value={a.id} />
                {a.missing.length === 0 ? <Submit className="btn-primary" pendingText="Convertendo…">Confirmar contratação</Submit> : <button type="button" disabled className="btn-primary opacity-50">Confirmar contratação</button>}
              </ActionForm>
              <details className="rounded-lg border border-stone-200 px-3 py-2 text-sm">
                <summary className="cursor-pointer text-stone-600">Cancelar processo</summary>
                <ActionForm action={cancelAction} className="mt-3 grid gap-3 sm:w-96">
                  <input type="hidden" name="id" value={a.id} />
                  <SelectField name="reason" label="Motivo" placeholder="Escolha…" options={Object.entries(CANCEL_REASON_LABEL).map(([value, label]) => ({ value, label }))} />
                  <TextAreaField name="note" label="Observação" />
                  <Submit className="btn-ghost text-red-700" pendingText="…">Cancelar admissão</Submit>
                </ActionForm>
              </details>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title="Dados da admissão">
            {manage ? (
              <ActionForm action={updateAdmissionAction} className="grid gap-4 sm:grid-cols-3">
                <input type="hidden" name="id" value={a.id} />
                <Field name="admissionDate" label="Data de admissão" type="date" defaultValue={a.admissionDate ? dateKey(a.admissionDate) : ""} />
                <SelectField name="positionId" label="Cargo" defaultValue={a.positionId} options={positions.map((p) => ({ value: p.id, label: p.title }))} />
                <SelectField name="departmentId" label="Departamento (unidade)" defaultValue={a.departmentId} options={departments.map((d) => ({ value: d.id, label: `${d.name} — ${d.unit.name}` }))} />
                <SelectField name="managerId" label="Gestor" placeholder="—" defaultValue={a.managerId ?? ""} options={managers.map((m) => ({ value: m.id, label: `${m.name} (${m.department.name})` }))} />
                {a.showSalary && <Field name="salary" label="Salário (R$)" inputMode="decimal" defaultValue={money(a.salary)} />}
                <SelectField name="contractType" label="Contrato" defaultValue={a.contractType} options={[{ value: "CLT", label: "CLT" }, { value: "PJ", label: "PJ" }, { value: "ESTAGIO", label: "Estágio" }, { value: "TEMPORARIO", label: "Temporário" }, { value: "APRENDIZ", label: "Aprendiz" }]} />
                <SelectField name="schedule" label="Escala" placeholder="—" defaultValue={a.schedule ?? ""} options={Object.entries(SCHEDULE_LABEL).map(([value, label]) => ({ value, label }))} />
                <SelectField name="shift" label="Turno" placeholder="—" defaultValue={a.shift ?? ""} options={Object.entries(SHIFT_LABEL).map(([value, label]) => ({ value, label }))} />
                <Field name="workHours" label="Horário" placeholder="07:00–15:20" defaultValue={a.workHours ?? ""} />
                <Field name="weeklyHours" label="Jornada semanal (h)" inputMode="numeric" defaultValue={a.weeklyHours ?? ""} />
                <div className="sm:col-span-2"><CpfField label={a.cpfMasked ? `CPF do candidato (atual: ${a.cpfMasked}) — preencha só para alterar` : "CPF do candidato"} required={false} hint="Guardado cifrado; obrigatório para confirmar a contratação." /></div>
                <div className="flex flex-col justify-end gap-2 sm:col-span-3 sm:flex-row sm:gap-6">
                  <CheckboxField name="hasDependents" label="Possui dependentes (exige documentos de dependentes)" defaultChecked={a.hasDependents} />
                  <CheckboxField name="educationRequired" label="Cargo exige comprovação de escolaridade" defaultChecked={a.educationRequired} />
                </div>
                <div className="sm:col-span-3"><Submit>Salvar dados</Submit></div>
              </ActionForm>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                {[["Admissão", fmtDate(a.admissionDate)], ["Cargo", a.position.title], ["Departamento", `${a.department.name} — ${a.department.unit.name}`], ["Gestor", a.manager?.name ?? "—"], ["Salário", a.showSalary ? formatMoney(a.salary) : "restrito"], ["Escala", a.schedule ? SCHEDULE_LABEL[a.schedule] : "—"], ["Turno", a.shift ? SHIFT_LABEL[a.shift] : "—"], ["CPF", a.cpfMasked ?? "—"]].map(([k, v]) => <div key={k}><dt className="text-xs text-stone-500">{k}</dt><dd className="text-riale-900">{v}</dd></div>)}
              </dl>
            )}
          </Card>

          <Card title="Checklist documental" actions={<span className="text-xs text-stone-400">{a.docPerm ? "Anexos cifrados · acesso restrito e auditado" : "Sem acesso aos anexos"}</span>}>
            <div className="space-y-5">
              {byCat.map((g) => (
                <div key={g.cat}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{g.label}</p>
                  <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                    {g.docs.map((d) => {
                      const applicable = isApplicable(a, d.docType);
                      const required = isRequired(a, d.docType);
                      const files = filesOf(d.id);
                      return (
                        <li key={d.id} className={`p-3 text-sm ${applicable ? "" : "bg-stone-50 text-stone-400"}`} data-doc={d.docType.code}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-riale-900">{d.docType.label} {!applicable ? <Badge>não se aplica</Badge> : required ? null : <Badge>opcional</Badge>}</span>
                            <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
                          </div>
                          {d.status === "RECUSADO" && d.refusalReason && <p className="mt-1 text-xs text-red-700">Recusado: {d.refusalReason}</p>}
                          {files.length > 0 && <p className="mt-1 flex flex-wrap gap-2 text-xs">{files.map((f) => <a key={f.id} href={`/api/v1/documents/${f.id}`} className="text-gold-600 hover:underline">📎 {f.originalName}</a>)}</p>}
                          {manage && applicable && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <ActionForm action={docStatusAction} className="flex flex-wrap items-center gap-2">
                                <input type="hidden" name="documentId" value={d.id} />
                                <select name="status" defaultValue={d.status} className="input w-auto py-1 text-xs" aria-label={`Situação — ${d.docType.label}`}>{Object.entries(DOC_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                                <input name="refusalReason" placeholder="Motivo (se recusado)" defaultValue={d.refusalReason ?? ""} className="input w-48 py-1 text-xs" />
                                <Submit className="btn-ghost btn-sm" pendingText="…">Salvar</Submit>
                              </ActionForm>
                              {a.docPerm && (
                                <ActionForm action={attachAction} className="flex items-center gap-2">
                                  <input type="hidden" name="documentId" value={d.id} />
                                  <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.docx" className="max-w-52 text-xs" aria-label={`Anexo — ${d.docType.label}`} />
                                  <Submit className="btn-ghost btn-sm" pendingText="Enviando…">Anexar</Submit>
                                </ActionForm>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Exame admissional (ASO)">
            {a.exams.length === 0 && <p className="mb-3 text-sm text-stone-500">Nenhum exame agendado.</p>}
            <ul className="space-y-3">
              {a.exams.map((e) => {
                const sit = examSituation(e);
                const files = filesOf(e.id);
                return (
                  <li key={e.id} className="rounded-lg border border-stone-200 p-3 text-sm" data-exam={e.status}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-medium text-riale-900">{e.clinic.name}</span> · {fmtDateTime(e.scheduledAt)}</span>
                      <Badge tone={sit.tone}>{sit.label}</Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-stone-600">
                      <div><dt className="text-stone-400">Realização</dt><dd>{fmtDate(e.performedAt)}</dd></div>
                      <div><dt className="text-stone-400">ASO recebido</dt><dd>{fmtDate(e.asoReceivedAt)}</dd></div>
                      <div><dt className="text-stone-400">Resultado</dt><dd>{EXAM_RESULT_LABEL[e.result]}</dd></div>
                    </dl>
                    {e.note && <p className="mt-1 text-xs text-stone-500">{e.note}</p>}
                    {files.length > 0 && <p className="mt-1 text-xs">{files.map((f) => <a key={f.id} href={`/api/v1/documents/${f.id}`} className="mr-2 text-gold-600 hover:underline">📎 {f.originalName}</a>)}</p>}
                    {manage && e.status === "AGENDADO" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionForm action={updateExamAction} className="flex items-center gap-2">
                          <input type="hidden" name="examId" value={e.id} /><input type="hidden" name="action" value="realizado" />
                          <input type="date" name="date" defaultValue={dateKey(e.scheduledAt) <= today ? dateKey(e.scheduledAt) : today} className="input w-auto py-1 text-xs" aria-label="Data da realização" />
                          <Submit className="btn-primary btn-sm" pendingText="…">Realizado</Submit>
                        </ActionForm>
                        <ActionForm action={updateExamAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="action" value="falta" /><Submit className="btn-ghost btn-sm" pendingText="…">Não compareceu</Submit></ActionForm>
                        <ActionForm action={updateExamAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="action" value="cancelar" /><Submit className="btn-ghost btn-sm" pendingText="…">Cancelar</Submit></ActionForm>
                      </div>
                    )}
                    {manage && e.status === "REALIZADO" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionForm action={updateExamAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="examId" value={e.id} /><input type="hidden" name="action" value="aso" />
                          <input type="date" name="date" defaultValue={e.asoReceivedAt ? dateKey(e.asoReceivedAt) : today} className="input w-auto py-1 text-xs" aria-label="Recebimento do ASO" />
                          <select name="result" defaultValue={e.result === "PENDENTE" ? "" : e.result} className="input w-auto py-1 text-xs" aria-label="Resultado do ASO"><option value="">Resultado…</option><option value="APTO">Apto</option><option value="APTO_COM_RESTRICOES">Apto com restrições</option><option value="INAPTO">Inapto</option></select>
                          <Submit className="btn-primary btn-sm" pendingText="…">{e.asoReceivedAt ? "Corrigir ASO" : "Registrar ASO"}</Submit>
                        </ActionForm>
                        {a.docPerm && (
                          <ActionForm action={attachAction} className="flex items-center gap-2">
                            <input type="hidden" name="examId" value={e.id} />
                            <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" className="max-w-52 text-xs" aria-label="Anexo do ASO" />
                            <Submit className="btn-ghost btn-sm" pendingText="Enviando…">Anexar ASO</Submit>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {manage && !openExam && (
              clinics.length === 0 ? (
                <p className="mt-3 text-sm text-stone-500">Cadastre a clínica em <Link href="/admissoes/configuracoes" className="text-gold-600 hover:underline">Admissões › Configurações</Link> para agendar o exame.</p>
              ) : (
                <ActionForm action={scheduleExamAction} className="mt-4 grid gap-3 rounded-lg bg-riale-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
                  <input type="hidden" name="admissionId" value={a.id} />
                  <SelectField name="clinicId" label="Clínica" placeholder="Escolha…" options={clinics.map((c) => ({ value: c.id, label: c.name }))} />
                  <Field name="date" label="Data" type="date" defaultValue={today} />
                  <Field name="time" label="Horário" type="time" defaultValue="08:00" />
                  <Submit className="btn-primary" pendingText="…">{a.exams.length ? "Reagendar exame" : "Agendar exame"}</Submit>
                </ActionForm>
              )
            )}
          </Card>
        </div>

        <Card title="Histórico do candidato">
          <ol className="relative space-y-4 border-l border-stone-200 pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${e.type === "ADMISSAO" || e.type === "CONTRATACAO" ? "bg-emerald-600" : "bg-stone-300"}`} />
                <p className="text-sm text-stone-800">{e.summary}</p>
                <p className="text-xs text-stone-400">{fmtDateTime(e.occurredAt)} · {e.actorUser?.name ?? e.actorName ?? "Sistema"}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
