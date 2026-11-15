"use server";

import type { Role } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import { toPublicError } from "@/modules/shared/errors";
import { createDepartment, createPosition, createUnit, updateDepartment, updatePosition, updateUnit } from "@/modules/org/service";
import { createManager, revealManagerCpf, updateManager } from "@/modules/managers/service";
import { adminResetPassword, createUser, revealUserCpf, updateUser } from "@/modules/users/service";
import { setPermission } from "@/modules/permissions/service";
import { updateSetting } from "@/modules/settings/service";
import type { PermissionCode } from "@/lib/permissions";

const CFG = "/configuracoes";

function split(fd: FormData) {
  const { id, ...data } = formToObject(fd);
  return { id: id as string | undefined, data };
}

export async function saveUnitAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  const { id, data } = split(fd);
  return runAction(async () => {
    if (id) await updateUnit(user, id, data);
    else await createUnit(user, data);
    return id ? "Unidade atualizada." : "Unidade cadastrada.";
  }, [`${CFG}/unidades`, "/dashboard"]);
}

export async function saveDepartmentAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  const { id, data } = split(fd);
  return runAction(async () => {
    if (id) await updateDepartment(user, id, data);
    else await createDepartment(user, data);
    return id ? "Departamento atualizado." : "Departamento cadastrado.";
  }, [`${CFG}/departamentos`, "/dashboard"]);
}

export async function savePositionAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  const { id, data } = split(fd);
  return runAction(async () => {
    if (id) await updatePosition(user, id, data);
    else await createPosition(user, data);
    return id ? "Cargo atualizado." : "Cargo cadastrado.";
  }, ["/cargos"]);
}

export async function saveManagerAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  const { id, data } = split(fd);
  if (id && !data.cpf) delete data.cpf; // em edição, CPF em branco mantém o atual
  if (!data.directSuperiorId) data.directSuperiorId = null;
  return runAction(async () => {
    if (id) await updateManager(user, id, data);
    else await createManager(user, data);
    return id ? "Gestor atualizado." : "Gestor cadastrado.";
  }, [`${CFG}/gestores`, "/dashboard"]);
}

export async function saveUserAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  const { id, data } = split(fd);
  return runAction(async () => {
    if (id) {
      delete data.cpf;
      delete data.password;
      if (data.managerId === undefined) data.managerId = null;
      await updateUser(user, id, data);
      return "Usuário atualizado.";
    }
    await createUser(user, data);
    return "Usuário cadastrado. No primeiro acesso, a troca de senha será obrigatória.";
  }, [`${CFG}/usuarios`]);
}

export async function adminResetPasswordAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  return runAction(async () => {
    await adminResetPassword(user, String(fd.get("id")), String(fd.get("password") ?? ""));
    return "Senha temporária definida. O usuário deverá trocá-la no próximo acesso.";
  }, [`${CFG}/usuarios`]);
}

export async function togglePermissionAction(role: Role, code: PermissionCode, granted: boolean) {
  const user = await requireUser();
  return runAction(async () => {
    await setPermission(user, role, code, granted);
    return "Permissão atualizada.";
  }, [`${CFG}/permissoes`]);
}

export async function saveSettingAction(_: ActionState, fd: FormData) {
  const user = await requireUser();
  return runAction(async () => {
    await updateSetting(user, String(fd.get("key")), fd.get("value"));
    return "Configuração salva.";
  }, [`${CFG}/sistema`]);
}

export async function revealManagerCpfAction(managerId: string) {
  const user = await requireUser();
  try {
    return { ok: true, value: await revealManagerCpf(user, managerId) };
  } catch (e) {
    return { ok: false, message: toPublicError(e).message };
  }
}

export async function revealUserCpfAction(userId: string) {
  const user = await requireUser();
  try {
    return { ok: true, value: await revealUserCpf(user, userId) };
  } catch (e) {
    return { ok: false, message: toPublicError(e).message };
  }
}
