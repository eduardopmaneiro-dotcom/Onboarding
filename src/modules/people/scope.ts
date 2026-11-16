import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";

/** Colaboradores: Admin e RH corporativo veem todos; RH de unidade, a unidade; gestor, a própria equipe. */
export function employeeScopeWhere(user: CurrentUser): Prisma.EmployeeWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "RH") return user.unitId ? { department: { unitId: user.unitId } } : {};
  if (!user.managerId) return { id: "__none__" };
  return { OR: [{ managerId: user.managerId }, { department: { managers: { some: { id: user.managerId, active: true } } } }] };
}

/** Admissões: só Admin e RH (RH de unidade: a própria unidade). */
export function admissionScopeWhere(user: CurrentUser): Prisma.AdmissionWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "RH") return user.unitId ? { department: { unitId: user.unitId } } : {};
  return { id: "__none__" };
}
