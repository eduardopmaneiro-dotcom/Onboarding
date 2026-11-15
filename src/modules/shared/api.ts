import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import type { PermissionCode } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { toPublicError } from "@/modules/shared/errors";

/**
 * Envelope da API interna v1.
 * - Autenticação: sessão (cookie). Tokens de integração entram na fase de integrações.
 * - Autorização: exige "api.access" + a permissão do recurso.
 * - Respostas: { data } em sucesso; { error, fieldErrors? } em falha.
 */
export function apiRoute<Ctx = unknown>(permission: PermissionCode | null, handler: (user: CurrentUser, req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (!user.permissions.has("api.access") || (permission && !user.permissions.has(permission))) {
      await recordAudit({ entityType: "API", entityId: new URL(req.url).pathname, action: "ACCESS_DENIED", actorId: user.id, actorRole: user.role });
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    try {
      const result = await handler(user, req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result }, { status: req.method === "POST" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      const e = toPublicError(err);
      return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: e.status });
    }
  };
}

export async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
