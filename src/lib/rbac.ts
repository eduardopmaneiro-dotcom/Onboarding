import type { Role } from "@prisma/client";

/**
 * Matriz de permissões (Bloco 4). Mantida centralizada para evitar checagens
 * de acesso espalhadas e divergentes entre páginas/rotas.
 */
export const PERMISSIONS = {
  manageTemplates: ["ADMIN", "RH_CORPORATIVO"] as Role[],
  manageUsers: ["ADMIN"] as Role[],
  manageOrgStructure: ["ADMIN", "RH_CORPORATIVO"] as Role[],
  viewAllUnits: ["ADMIN", "RH_CORPORATIVO", "DIRETORIA_READONLY"] as Role[],
  viewUnit: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR", "DIRETORIA_READONLY"] as Role[],
  createOnboarding: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE"] as Role[],
  editOnboardingStage: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR"] as Role[],
  reopenStage: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE"] as Role[],
  createPDI: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR"] as Role[],
  validateChecklist: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR"] as Role[],
  viewAudit: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE"] as Role[],
  exportReports: ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "DIRETORIA_READONLY"] as Role[],
};

export function can(role: Role, permission: keyof typeof PERMISSIONS): boolean {
  return PERMISSIONS[permission].includes(role);
}

/** Colaborador só vê a própria trilha; gestor só vê sua equipe (escopo aplicado nas queries). */
export function isSelfServiceOnly(role: Role): boolean {
  return role === "COLABORADOR";
}
