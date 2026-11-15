import type { CurrentUser } from "@/lib/session";
import { ForbiddenError } from "@/modules/shared/errors";

/**
 * Escopo de dados por unidade.
 * - ADMIN e RH corporativo (sem unidade): todas as unidades → null.
 * - RH de unidade: apenas a própria unidade.
 * - GESTOR: leitura da estrutura; escrita bloqueada pelas permissões.
 */
export function unitScope(user: CurrentUser): string | null {
  if (user.role === "ADMIN") return null;
  return user.unitId ?? null;
}

export function assertUnitInScope(user: CurrentUser, unitId: string) {
  const scope = unitScope(user);
  if (scope && scope !== unitId) throw new ForbiddenError("Fora do escopo da sua unidade");
}

export function isCorporate(user: CurrentUser) {
  return unitScope(user) === null;
}
