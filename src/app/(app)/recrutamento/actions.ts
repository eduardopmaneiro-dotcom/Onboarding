"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import { toPublicError } from "@/modules/shared/errors";
import { createJob, updateJob } from "@/modules/recruitment/jobs";
import { addApplication, createCandidate, DuplicateCandidateError, updateCandidate, updateSalary } from "@/modules/recruitment/candidates";
import { cancelInterview, decideReview, registerHire, registerResult, rescheduleInterview, scheduleInterviews, setExternalCheck } from "@/modules/recruitment/workflow";
import { cancelImport, commitImport, saveColumnMap, saveValueMap, setRowDecision, uploadSpreadsheet, type ColumnMap, type ValueMap } from "@/modules/import/service";
import type { ExternalCheckStatus } from "@prisma/client";

const R = ["/vagas", "/candidatos", "/entrevistas", "/aprovacoes", "/dashboard"];

// ─────────── Vagas ───────────
export async function saveJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { id, ...data } = formToObject(fd);
  let jobId = id as string | undefined;
  const r = await runAction(async () => {
    if (jobId) await updateJob(user, jobId, data);
    else jobId = (await createJob(user, data)).id;
    return jobId ? "Vaga salva." : "Vaga criada.";
  }, R);
  if (r?.ok && !id) redirect(`/vagas/${jobId}?criada=1`);
  return r;
}

export async function setJobStatusAction(jobId: string, status: string) {
  const user = await requireUser();
  return runAction(async () => {
    await updateJob(user, jobId, { status });
    return "Status da vaga atualizado.";
  }, R);
}

// ─────────── Candidatos ───────────
export async function saveCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const data = formToObject(fd);
  const next = String(fd.get("next") ?? "");
  let candidateId: string | undefined;
  try {
    const r = await createCandidate(user, data);
    candidateId = r.candidate.id;
  } catch (e) {
    if (e instanceof DuplicateCandidateError) return { ok: false, message: e.message, data: { duplicates: e.matches } };
    const p = toPublicError(e);
    return { ok: false, message: p.message, fieldErrors: p.fieldErrors };
  }
  for (const p of R) revalidatePath(p);
  const job = data.jobOpeningId as string | undefined;
  if (next === "agendar") redirect(`/entrevistas/agendar?candidato=${candidateId}${job ? `&vaga=${job}` : ""}`);
  if (next === "novo") redirect(`/candidatos/novo?ok=${Date.now()}${job ? `&vaga=${job}` : ""}`);
  redirect(`/candidatos/${candidateId}?criado=1`);
}

export async function updateCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { id, ...data } = formToObject(fd);
  return runAction(async () => {
    await updateCandidate(user, String(id), data);
    return "Cadastro atualizado.";
  }, R);
}

export async function addApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await addApplication(user, String(fd.get("candidateId")), String(fd.get("jobOpeningId")));
    return "Candidato vinculado à vaga.";
  }, R);
}

export async function saveSalaryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { applicationId, ...rest } = formToObject(fd);
  return runAction(async () => {
    await updateSalary(user, String(applicationId), { ...rest, valuedBenefits: fd.getAll("valuedBenefits").map(String) });
    return "Negociação salarial registrada.";
  }, R);
}

// ─────────── Entrevistas ───────────
export async function scheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const data: Record<string, unknown> & { candidateIds: string[] } = { ...formToObject(fd), candidateIds: fd.getAll("candidateIds").map(String).filter(Boolean) };
  let date = "";
  let aviso = "";
  const r = await runAction(async () => {
    const created = await scheduleInterviews(user, data);
    date = String(data.date);
    const n = created.notices;
    if (n.some((x) => x.hold)) aviso = "revisar";
    else if (n.length) aviso = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(Math.min(...n.map((x) => x.scheduledFor.getTime()))));
    return `${created.length} entrevista(s) agendada(s).`;
  }, R);
  if (r?.ok) redirect(`/entrevistas?visao=dia&data=${date}&agendadas=${data.candidateIds.length}${aviso ? `&aviso=${encodeURIComponent(aviso)}` : ""}`);
  return r;
}

export async function resultAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { interviewId, ...rest } = formToObject(fd);
  return runAction(async () => {
    await registerResult(user, String(interviewId), { ...rest, valuedBenefits: fd.getAll("valuedBenefits").map(String) });
    return rest.result === "APROVADO" ? "Resultado registrado e candidato encaminhado ao gestor." : "Resultado registrado.";
  }, R);
}

export async function rescheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await rescheduleInterview(user, String(fd.get("interviewId")), String(fd.get("date")), String(fd.get("time")), (fd.get("interviewerUserId") as string) || undefined);
    return "Entrevista remarcada.";
  }, R);
}

export async function cancelInterviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await cancelInterview(user, String(fd.get("interviewId")), (fd.get("note") as string) || undefined);
    return "Entrevista cancelada.";
  }, R);
}

export async function externalCheckAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await setExternalCheck(user, String(fd.get("applicationId")), String(fd.get("status")) as ExternalCheckStatus, (fd.get("note") as string) || undefined);
    return "Avaliação externa atualizada.";
  }, R);
}

// ─────────── Gestor ───────────
export async function decisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { reviewId, ...rest } = formToObject(fd);
  return runAction(async () => {
    await decideReview(user, String(reviewId), rest);
    return "Decisão registrada.";
  }, R);
}

// ─────────── Importação ───────────
export async function uploadImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const r = await runAction(async () => {
    const file = fd.get("file");
    if (!(file instanceof File)) throw new Error("Arquivo ausente");
    id = (await uploadSpreadsheet(user, file)).id;
    return "Planilha carregada.";
  }, ["/recrutamento/importar"]);
  if (r?.ok) redirect(`/recrutamento/importar/${id}`);
  return r;
}

export async function columnMapAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("batchId"));
  const map: ColumnMap = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("col:")) map[k.slice(4)] = String(v) as ColumnMap[string];
  return runAction(async () => {
    await saveColumnMap(user, id, map);
    return "Colunas salvas e planilha reanalisada.";
  }, [`/recrutamento/importar/${id}`]);
}

export async function valueMapAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("batchId"));
  const vm = JSON.parse(String(fd.get("current") ?? "{}")) as ValueMap;
  for (const [k, v] of fd.entries()) {
    const [kind, key, sub] = k.split("::");
    if (!key) continue;
    if (kind === "unidade") vm.unidade[key] = String(v);
    if (kind === "recrutador") vm.recrutador[key] = String(v);
    if (kind === "resultado") vm.resultado[key] = String(v) as ValueMap["resultado"][string];
    if (kind === "motivo") vm.motivo[key] = String(v);
    if (kind === "vaga") {
      vm.vaga[key] ??= { positionId: "NEW", departmentName: "" };
      if (sub === "pos") vm.vaga[key].positionId = String(v);
      if (sub === "dept") vm.vaga[key].departmentName = String(v);
      if (sub === "title") vm.vaga[key].newTitle = String(v);
    }
  }
  return runAction(async () => {
    await saveValueMap(user, id, vm);
    return "Correspondências salvas e planilha reanalisada.";
  }, [`/recrutamento/importar/${id}`]);
}

export async function rowDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("batchId"));
  return runAction(async () => {
    await setRowDecision(user, String(fd.get("rowId")), String(fd.get("decision")) as "IMPORTAR" | "IGNORAR" | "VINCULAR", (fd.get("reason") as string) || undefined);
    return "Decisão da linha salva.";
  }, [`/recrutamento/importar/${id}`]);
}

export async function commitImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("batchId"));
  return runAction(async () => {
    const r = await commitImport(user, id);
    return `Importação concluída: ${r.imported} entrevista(s) de ${r.candidates} candidato(s) em ${r.jobs} vaga(s) histórica(s).`;
  }, [`/recrutamento/importar/${id}`, ...R]);
}

export async function cancelImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await cancelImport(user, String(fd.get("batchId")));
    return "Importação descartada.";
  }, ["/recrutamento/importar"]);
}

export async function hireAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await registerHire(user, String(fd.get("applicationId")), { date: fd.get("date") });
    return "Admissão registrada.";
  }, [...R, "/relatorios"]);
}
