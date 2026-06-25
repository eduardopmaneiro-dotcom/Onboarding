import type { Prisma, Role } from "@prisma/client";

type SessionUser = {
  role: Role;
  unitId: string | null;
  employeeId: string | null;
};

/**
 * Escopo de visibilidade de colaboradores por perfil (Bloco 4):
 * - ADMIN / RH_CORPORATIVO / DIRETORIA_READONLY: todas as unidades.
 * - RH_UNIDADE: apenas a própria unidade.
 * - GESTOR: apenas os colaboradores em que ele é o gestor direto.
 * - COLABORADOR: apenas o próprio registro.
 */
export function employeeScopeWhere(user: SessionUser): Prisma.EmployeeWhereInput {
  switch (user.role) {
    case "ADMIN":
    case "RH_CORPORATIVO":
    case "DIRETORIA_READONLY":
      return {};
    case "RH_UNIDADE":
      return { unitId: user.unitId ?? "__none__" };
    case "GESTOR":
      return { managerId: user.employeeId ?? "__none__" };
    case "COLABORADOR":
      return { id: user.employeeId ?? "__none__" };
    default:
      return { id: "__none__" };
  }
}
