"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import { createDirectEmployee, recordMilestone, terminateEmployee } from "@/modules/people/service";
import { markAlertRead } from "@/modules/people/alerts";

const R = ["/colaboradores", "/dashboard", "/relatorios"];

export async function createEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const r = await runAction(async () => { id = (await createDirectEmployee(user, formToObject(fd))).id; return "Colaborador cadastrado."; }, R);
  if (r?.ok) redirect(`/colaboradores/${id}`);
  return r;
}

export async function milestoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { milestoneId, ...data } = formToObject(fd);
  return runAction(async () => { await recordMilestone(user, String(milestoneId), data); return "Avaliação registrada."; }, R);
}

export async function terminateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { employeeId, ...data } = formToObject(fd);
  return runAction(async () => { await terminateEmployee(user, String(employeeId), data); return "Desligamento registrado."; }, R);
}

export async function readAlertAction(fd: FormData) {
  const user = await requireUser();
  await markAlertRead(user, String(fd.get("id")));
  revalidatePath("/dashboard");
}
