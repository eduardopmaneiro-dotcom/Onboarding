"use server";

import { requireUser } from "@/lib/session";
import { runAction, type ActionState } from "@/modules/shared/action";
import { cancelDigest, closeDayManual, editDigest, rectify, retryMessage, sendDigestNow, sendTestEmail } from "@/modules/email/service";
import { previewAgenda } from "@/modules/email/digests";

const R = ["/comunicacoes", "/entrevistas", "/dashboard"];

export async function closeDayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    const r = await closeDayManual(user, String(fd.get("date")));
    if (!r) return "A agenda já estava encerrada.";
    return `Agenda encerrada: ${r.managers} gestor(es) receberão o resultado de ${r.interviews} entrevista(s)${r.pending ? ` — ${r.pending} sem resultado foram informadas como pendentes` : ""}.`;
  }, R);
}

export async function rectifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await rectify(user, String(fd.get("managerId")), String(fd.get("date")));
    return "Retificação emitida.";
  }, R);
}

export async function sendNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    const n = await sendDigestNow(user, String(fd.get("id")));
    return n ? "Aviso emitido para o gestor." : "Nada a enviar: a agenda não mudou desde o último aviso (registrado como descartado).";
  }, R);
}

export async function cancelDigestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    await cancelDigest(user, String(fd.get("id")));
    return "Aviso não será enviado.";
  }, R);
}

export async function editDigestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(fd.get("id"));
  return runAction(async () => {
    const p = await previewAgenda(id);
    await editDigest(user, id, { subject: fd.get("subject"), body: fd.get("body") }, { hash: p.hash });
    if (fd.get("then") === "enviar") {
      await sendDigestNow(user, id);
      return "Texto salvo e aviso emitido.";
    }
    return "Texto salvo. Ele será usado no envio, desde que a agenda não mude.";
  }, [...R, `/comunicacoes/${id}`]);
}

export async function retryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    const r = await retryMessage(user, String(fd.get("id")));
    return r === "ENVIADA" ? "Mensagem enviada." : r === "PENDENTE" ? "Nova falha — a mensagem segue na fila com nova tentativa programada." : "Mensagem reprocessada.";
  }, R);
}

export async function testEmailAction(): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => {
    const r = await sendTestEmail(user);
    return r === "ENVIADA" ? `E-mail de teste enviado para ${user.email}.` : "O provedor recusou o envio — veja o erro na fila abaixo.";
  }, R);
}
