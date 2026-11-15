"use server";

import { formToObject, runAction, type ActionState } from "@/modules/shared/action";
import { requestPasswordReset, resetPasswordWithToken } from "@/modules/auth/service";
import { redirect } from "next/navigation";

export async function requestResetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requestPasswordReset(formToObject(fd));
    return "Se os dados conferirem com um cadastro ativo, você receberá no e-mail um link válido por 30 minutos.";
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    await resetPasswordWithToken(String(fd.get("token") ?? ""), String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
    return "ok";
  });
  if (r?.ok) redirect("/login?ok=reset");
  return r;
}
