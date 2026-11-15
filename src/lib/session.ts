import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import type { PermissionCode } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  unitId: string | null;
  managerId: string | null;
  mustChangePassword: boolean;
  permissions: Set<PermissionCode>;
};

/**
 * Usuário atual, revalidado no banco a cada requisição: um usuário desativado
 * ou com senha trocada perde o acesso imediatamente, mesmo com JWT ainda válido.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { manager: { select: { id: true } } },
  });
  if (!user || !user.active) return null;
  if ((user.passwordChangedAt?.getTime() ?? 0) > (session.user.pwdAt ?? 0)) return null;

  const grants = await prisma.rolePermission.findMany({
    where: { role: user.role },
    select: { permission: { select: { code: true } } },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    unitId: user.unitId,
    managerId: user.manager?.id ?? null,
    mustChangePassword: user.mustChangePassword,
    permissions: new Set(grants.map((g) => g.permission.code as PermissionCode)),
  };
});

export function can(user: CurrentUser | null, code: PermissionCode): boolean {
  return !!user && user.permissions.has(code);
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(code: PermissionCode): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, code)) {
    await recordAudit({ entityType: "Permission", entityId: code, action: "ACCESS_DENIED", actorId: user.id, actorRole: user.role });
    redirect("/acesso-negado");
  }
  return user;
}

/** Erro de autorização usado pela camada de serviço (mapeado para 403 na API). */
export class ForbiddenError extends Error {
  constructor(message = "Acesso negado") {
    super(message);
  }
}

export function assertCan(user: CurrentUser, code: PermissionCode) {
  if (!can(user, code)) throw new ForbiddenError();
}
