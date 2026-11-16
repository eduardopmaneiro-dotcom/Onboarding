"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import { ValidationError } from "@/modules/shared/errors";
import { attachAdmissionFile, cancelAdmission, confirmAdmission, forwardToAdmission, scheduleExam, setDocumentStatus, updateAdmission, updateExam } from "@/modules/admission/service";
import { saveClinic, saveDocType } from "@/modules/admission/config";
import { updateSetting, RH_SETTINGS } from "@/modules/settings/service";

const R = ["/admissoes", "/candidatos", "/colaboradores", "/dashboard", "/relatorios"];

export async function forwardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const r = await runAction(async () => { id = (await forwardToAdmission(user, String(fd.get("applicationId")))).id; return "Encaminhado para admissão."; }, R);
  if (r?.ok) redirect(`/admissoes/${id}`);
  return r;
}

export async function updateAdmissionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { id, ...data } = formToObject(fd);
  return runAction(async () => { await updateAdmission(user, String(id), data); return "Dados da admissão salvos."; }, R);
}

export async function docStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { documentId, ...data } = formToObject(fd);
  return runAction(async () => { await setDocumentStatus(user, String(documentId), data); return "Situação do documento atualizada."; }, R);
}

export async function attachAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = fd.get("file");
  return runAction(async () => {
    if (!(file instanceof File) || !file.size) throw new ValidationError("Escolha o arquivo", { file: ["Obrigatório"] });
    await attachAdmissionFile(user, { documentId: (fd.get("documentId") as string) || undefined, examId: (fd.get("examId") as string) || undefined }, file);
    return "Arquivo anexado (cifrado, acesso restrito).";
  }, R);
}

export async function scheduleExamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { admissionId, ...data } = formToObject(fd);
  return runAction(async () => { await scheduleExam(user, String(admissionId), data); return "Exame agendado."; }, R);
}

export async function updateExamAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { examId, ...data } = formToObject(fd);
  return runAction(async () => { await updateExam(user, String(examId), data); return "Exame atualizado."; }, R);
}

export async function confirmAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let empId = "";
  const r = await runAction(async () => { empId = (await confirmAdmission(user, String(fd.get("id")))).id; return "Contratação confirmada."; }, R);
  if (r?.ok) redirect(`/colaboradores/${empId}?admitido=1`);
  return r;
}

export async function cancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { id, ...data } = formToObject(fd);
  return runAction(async () => { await cancelAdmission(user, String(id), data); return "Processo cancelado."; }, R);
}

export async function saveDocTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => { await saveDocType(user, formToObject(fd)); return "Checklist atualizado."; }, ["/admissoes"]);
}

export async function saveClinicAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => { await saveClinic(user, formToObject(fd)); return "Clínica salva."; }, ["/admissoes"]);
}

export async function saveRulesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const data = formToObject(fd);
  return runAction(async () => {
    for (const key of RH_SETTINGS) if (key in data) await updateSetting(user, key, data[key]);
    return "Regras da experiência salvas. Valem para as próximas admissões.";
  }, ["/admissoes", "/colaboradores"]);
}
