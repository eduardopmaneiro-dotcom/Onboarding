import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { toPublicError } from "@/modules/shared/errors";

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]>; data?: Record<string, unknown> } | null;

/** FormData → objeto simples (strings vazias viram undefined; checkboxes "on" → true). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    const val = v.trim();
    out[k] = val === "" ? undefined : val === "on" ? true : val;
  }
  return out;
}

/** Envelope padrão das server actions: validação/erros tratados de forma uniforme. */
export async function runAction(
  fn: () => Promise<string | { message: string; data?: Record<string, unknown> }>,
  revalidate?: string | string[]
): Promise<ActionState> {
  try {
    const r = await fn();
    for (const p of ([] as string[]).concat(revalidate ?? [])) revalidatePath(p);
    return typeof r === "string" ? { ok: true, message: r } : { ok: true, message: r.message, data: r.data };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const e = toPublicError(err);
    return { ok: false, message: e.message, fieldErrors: e.fieldErrors };
  }
}
