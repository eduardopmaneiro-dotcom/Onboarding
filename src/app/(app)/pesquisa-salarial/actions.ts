"use server";

import { requireUser } from "@/lib/session";
import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import { deleteMarketSalary, saveMarketSalary } from "@/modules/compensation/market";

export async function marketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => { await saveMarketSalary(user, formToObject(fd)); return "Registro de mercado salvo."; }, ["/pesquisa-salarial"]);
}
export async function deleteMarketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => { await deleteMarketSalary(user, String(fd.get("id"))); return "Registro excluído."; }, ["/pesquisa-salarial"]);
}
