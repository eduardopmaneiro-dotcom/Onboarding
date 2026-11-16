"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { runAction, type ActionState } from "@/modules/shared/action";
import { ValidationError } from "@/modules/shared/errors";
import { applyCompanyData, uploadCompanyData } from "@/modules/dataimport/service";

export async function uploadDataAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const r = await runAction(async () => {
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Escolha a planilha de carga", { file: ["Obrigatório"] });
    id = (await uploadCompanyData(user, file)).documentId;
    return "Planilha analisada — confira a prévia.";
  });
  if (r?.ok) redirect(`/configuracoes/importar-dados?arquivo=${id}`);
  return r;
}

export async function applyDataAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const r = await runAction(async () => { id = (await applyCompanyData(user, String(fd.get("documentId")))).id; return "Carga aplicada."; }, ["/colaboradores", "/cargos", "/remuneracao", "/carreira"]);
  if (r?.ok) redirect(`/configuracoes/importar-dados?aplicada=${id}`);
  return r;
}
