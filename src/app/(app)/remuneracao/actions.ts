"use server";

import { requireUser } from "@/lib/session";
import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import {
  addEmployeeSalary, addPayItem, decideElogio, deletePayItem, endBenefit, enrollBenefit, registerElogio, saveBenefit, saveBenefitUnitCost,
  saveElogioRule, savePayItemType, savePositionSalary, savePpr, savePprGoal, saveRate,
} from "@/modules/compensation/service";

const R = ["/remuneracao", "/pesquisa-salarial"];
type Fn = (user: Awaited<ReturnType<typeof requireUser>>, data: Record<string, unknown>, fd: FormData) => Promise<unknown>;
async function run(fd: FormData, fn: Fn, msg: string): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => { await fn(user, formToObject(fd), fd); return msg; }, R);
}

export async function positionSalaryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => savePositionSalary(u, d), "Tabela salarial atualizada.");
}
export async function employeeSalaryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, { employeeId, ...d }) => addEmployeeSalary(u, String(employeeId), d), "Salário-base registrado.");
}
export async function payItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, { employeeId, ...d }) => addPayItem(u, String(employeeId), d), "Lançamento registrado.");
}
export async function deletePayItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, { id }) => deletePayItem(u, String(id)), "Lançamento excluído.");
}
export async function enrollAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, { employeeId, ...d }) => enrollBenefit(u, String(employeeId), d), "Benefício incluído.");
}
export async function endBenefitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, { id, ...d }) => endBenefit(u, String(id), d), "Benefício encerrado.");
}
export async function benefitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d, fd) => saveBenefit(u, { ...d, unitIds: fd.getAll("unitIds").map(String) }), "Benefício salvo.");
}
export async function benefitUnitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => saveBenefitUnitCost(u, d), "Valor da unidade salvo.");
}
export async function rateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => saveRate(u, d), "Encargo salvo.");
}
export async function payTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => savePayItemType(u, d), "Rubrica salva.");
}
export async function elogioRuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => saveElogioRule(u, d), "Regra do Elogio Premiado registrada.");
}
export async function elogioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => registerElogio(u, d), "Elogio registrado — aguarda aprovação.");
}
export async function decideElogioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, { id, ...d }) => decideElogio(u, String(id), d), "Elogio analisado.");
}
export async function pprAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => savePpr(u, d), "Programa salvo.");
}
export async function pprGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, (u, d) => savePprGoal(u, d), "Meta salva.");
}
