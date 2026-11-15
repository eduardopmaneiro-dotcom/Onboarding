import type { Role } from "@prisma/client";

/**
 * Catálogo de permissões. O banco (RolePermission) é a fonte de verdade em tempo
 * de execução — o ADMIN pode ajustar a matriz em Configurações › Permissões.
 * Aqui ficam apenas o catálogo e a concessão padrão usada no seed.
 */
type Def = { module: string; description: string; defaults: Role[] };

const A: Role = "ADMIN";
const R: Role = "RH";
const G: Role = "GESTOR";

export const PERMISSION_CATALOG = {
  "dashboard.view": { module: "Dashboard", description: "Ver o dashboard", defaults: [A, R, G] },
  "vagas.view": { module: "Vagas", description: "Acessar o módulo de vagas", defaults: [A, R, G] },
  "candidatos.view": { module: "Candidatos", description: "Acessar o módulo de candidatos", defaults: [A, R] },
  "entrevistas.view": { module: "Entrevistas", description: "Acessar o módulo de entrevistas", defaults: [A, R, G] },
  "admissoes.view": { module: "Admissões", description: "Acessar o módulo de admissões", defaults: [A, R] },
  "colaboradores.view": { module: "Colaboradores", description: "Acessar o módulo de colaboradores", defaults: [A, R, G] },
  "remuneracao.view": { module: "Remuneração", description: "Acessar o módulo de remuneração", defaults: [A, R] },
  "pesquisa_salarial.view": { module: "Pesquisa salarial", description: "Acessar a pesquisa salarial", defaults: [A, R] },
  "carreira.view": { module: "Cargos e carreira", description: "Ver cargos e trilhas de carreira", defaults: [A, R, G] },
  "relatorios.view": { module: "Relatórios", description: "Acessar relatórios", defaults: [A, R, G] },
  "configuracoes.view": { module: "Configurações", description: "Acessar a área de configurações", defaults: [A, R] },
  "org.manage": { module: "Estrutura", description: "Cadastrar unidades, departamentos e cargos", defaults: [A, R] },
  "managers.manage": { module: "Estrutura", description: "Cadastrar gestores e superiores diretos", defaults: [A, R] },
  "users.view": { module: "Usuários", description: "Listar usuários do sistema", defaults: [A, R] },
  "users.manage": { module: "Usuários", description: "Cadastrar e editar usuários (RH: apenas perfil Gestor)", defaults: [A, R] },
  "permissions.manage": { module: "Segurança", description: "Alterar a matriz de permissões", defaults: [A] },
  "audit.view": { module: "Segurança", description: "Consultar a trilha de auditoria", defaults: [A, R] },
  "settings.manage": { module: "Sistema", description: "Alterar configurações do sistema", defaults: [A] },
  "pii.reveal": { module: "LGPD", description: "Revelar CPF completo (acesso auditado)", defaults: [A, R] },
  "documents.read": { module: "Documentos", description: "Baixar documentos protegidos", defaults: [A, R] },
  "documents.write": { module: "Documentos", description: "Enviar documentos protegidos", defaults: [A, R] },
  "api.access": { module: "API", description: "Usar a API interna /api/v1", defaults: [A, R, G] },
} satisfies Record<string, Def>;

export type PermissionCode = keyof typeof PERMISSION_CATALOG;

/** Permissões que nunca podem ser retiradas do ADMIN (evita trancar o sistema). */
export const ADMIN_LOCKED: PermissionCode[] = ["permissions.manage", "users.manage", "users.view", "configuracoes.view", "audit.view"];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  RH: "Recursos Humanos",
  GESTOR: "Gestor",
};
