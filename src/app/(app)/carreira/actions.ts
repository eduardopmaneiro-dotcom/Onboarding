"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import { ValidationError } from "@/modules/shared/errors";
import { attachDescriptorFile, publishDescriptor, saveDescriptorDraft } from "@/modules/career/descriptors";
import { draftFromFamily, moveStep, removeStep, savePath, saveStep, setPathStatus } from "@/modules/career/paths";
import { createPdi, registerMovement, registerPromotionScore, updatePdi } from "@/modules/career/people";
import { addExperience, addToTalentPool, removeExperience, saveCandidateProfile, setTalentStatus } from "@/modules/career/talent";
import { updateSetting, CAREER_SETTINGS } from "@/modules/settings/service";

const R = ["/cargos", "/carreira", "/candidatos", "/banco-de-talentos", "/colaboradores"];
type U = Awaited<ReturnType<typeof requireUser>>;
async function run(fd: FormData, fn: (u: U, d: Record<string, unknown>) => Promise<unknown>, msg: string): Promise<ActionState> {
  const user = await requireUser();
  return runAction(async () => { await fn(user, formToObject(fd)); return msg; }, R);
}

export async function descriptorDraftAction(_: ActionState, fd: FormData) { return run(fd, (u, { positionId, ...d }) => saveDescriptorDraft(u, String(positionId), d), "Rascunho do descritivo salvo."); }
export async function descriptorPublishAction(_: ActionState, fd: FormData) { return run(fd, (u, { positionId, ...d }) => publishDescriptor(u, String(positionId), d), "Descritivo publicado como vigente."); }
export async function descriptorFileAction(_: ActionState, fd: FormData) {
  return run(fd, async (u, { positionId }) => {
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Escolha o arquivo", { file: ["Obrigatório"] });
    await attachDescriptorFile(u, String(positionId), file);
  }, "Documento anexado.");
}
export async function pathAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  let id = "";
  const r = await runAction(async () => { id = (await savePath(user, formToObject(fd))).id; return "Trilha salva."; }, R);
  if (r?.ok && !fd.get("id")) redirect(`/carreira?trilha=${id}`);
  return r;
}
export async function stepAction(_: ActionState, fd: FormData) { return run(fd, (u, d) => saveStep(u, d), "Passo salvo."); }
export async function removeStepAction(_: ActionState, fd: FormData) { return run(fd, (u, { id }) => removeStep(u, String(id)), "Passo removido."); }
export async function moveStepAction(_: ActionState, fd: FormData) { return run(fd, (u, { id, dir }) => moveStep(u, String(id), dir === "up" ? "up" : "down"), "Ordem alterada."); }
export async function pathStatusAction(_: ActionState, fd: FormData) { return run(fd, (u, { id, status }) => setPathStatus(u, String(id), status as "VIGENTE"), "Situação da trilha atualizada."); }
export async function draftFromFamilyAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  let id = "";
  const r = await runAction(async () => { id = (await draftFromFamily(user, String(fd.get("familyId")))).id; return "Rascunho criado."; }, R);
  if (r?.ok) redirect(`/carreira?trilha=${id}`);
  return r;
}
export async function movementAction(_: ActionState, fd: FormData) { return run(fd, (u, { employeeId, ...d }) => registerMovement(u, String(employeeId), d), "Movimentação registrada."); }
export async function scoreAction(_: ActionState, fd: FormData) { return run(fd, (u, { employeeId, ...d }) => registerPromotionScore(u, String(employeeId), d), "Avaliação de promoção registrada."); }
export async function pdiAction(_: ActionState, fd: FormData) { return run(fd, (u, { employeeId, ...d }) => createPdi(u, String(employeeId), d), "Item do PDI criado."); }
export async function pdiUpdateAction(_: ActionState, fd: FormData) { return run(fd, (u, { id, ...d }) => updatePdi(u, String(id), d), "PDI atualizado."); }
export async function profileAction(_: ActionState, fd: FormData) { return run(fd, (u, { candidateId, ...d }) => saveCandidateProfile(u, String(candidateId), d), "Perfil salvo."); }
export async function experienceAction(_: ActionState, fd: FormData) { return run(fd, (u, { candidateId, ...d }) => addExperience(u, String(candidateId), d), "Experiência registrada."); }
export async function removeExperienceAction(_: ActionState, fd: FormData) { return run(fd, (u, { id }) => removeExperience(u, String(id)), "Experiência removida."); }
export async function talentAction(_: ActionState, fd: FormData) { return run(fd, (u, d) => addToTalentPool(u, d), "Incluído no banco de talentos."); }
export async function talentStatusAction(_: ActionState, fd: FormData) { return run(fd, (u, { id, ...d }) => setTalentStatus(u, String(id), d), "Banco de talentos atualizado."); }
export async function careerPolicyAction(_: ActionState, fd: FormData) {
  return run(fd, async (u, d) => { for (const k of CAREER_SETTINGS) if (k in d) await updateSetting(u, k, d[k]); }, "Política de carreira salva.");
}
