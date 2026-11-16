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
  "candidatos.view": { module: "Candidatos", description: "Acessar candidatos (gestor: apenas das suas vagas)", defaults: [A, R, G] },
  "entrevistas.view": { module: "Entrevistas", description: "Acessar o módulo de entrevistas", defaults: [A, R, G] },
  "recrutamento.manage": { module: "Recrutamento", description: "Cadastrar e editar vagas, candidatos e agendar entrevistas", defaults: [A, R] },
  "entrevistas.resultado": { module: "Recrutamento", description: "Registrar resultado das entrevistas (RH)", defaults: [A, R] },
  "recrutamento.salarios": { module: "Recrutamento", description: "Ver e registrar pretensão salarial e oferta", defaults: [A, R, G] },
  "aprovacoes.view": { module: "Recrutamento", description: "Acessar aprovações do gestor", defaults: [A, R, G] },
  "aprovacoes.decidir": { module: "Recrutamento", description: "Decidir sobre candidatos encaminhados (como gestor responsável)", defaults: [A, G] },
  "aprovacoes.registrar": { module: "Recrutamento", description: "Registrar a decisão em nome de gestor sem acesso ao sistema", defaults: [A, R] },
  "importacao.executar": { module: "Recrutamento", description: "Importar a planilha de recrutamento", defaults: [A, R] },
  "comunicacoes.view": { module: "Comunicação", description: "Ver avisos e e-mails enviados aos gestores", defaults: [A, R] },
  "comunicacoes.manage": { module: "Comunicação", description: "Revisar/enviar avisos, encerrar o dia e emitir retificações", defaults: [A, R] },
  "admissoes.view": { module: "Admissões", description: "Acessar o módulo de admissões", defaults: [A, R] },
  "admissoes.manage": { module: "Admissões", description: "Encaminhar para admissão, conferir documentos, exame e confirmar a contratação", defaults: [A, R] },
  "admissoes.documentos": { module: "Admissões", description: "Ver, enviar e baixar os documentos admissionais (acesso restrito e auditado)", defaults: [A, R] },
  "admissoes.config": { module: "Admissões", description: "Configurar checklist documental, clínicas e regras da experiência", defaults: [A, R] },
  "colaboradores.view": { module: "Colaboradores", description: "Acessar colaboradores (gestor: apenas a própria equipe, sem salário)", defaults: [A, R, G] },
  "colaboradores.manage": { module: "Colaboradores", description: "Cadastrar colaborador já admitido, registrar avaliações da experiência e desligamentos", defaults: [A, R] },
  "colaboradores.salario": { module: "Colaboradores", description: "Ver salário de admissão dos colaboradores", defaults: [A, R] },
  "remuneracao.view": { module: "Remuneração", description: "Ver salários, lançamentos, benefícios e custo total (RH de unidade: só a unidade)", defaults: [A, R] },
  "remuneracao.manage": { module: "Remuneração", description: "Registrar salário-base, lançamentos pagos, adesões a benefícios e elogios", defaults: [A, R] },
  "remuneracao.config": { module: "Remuneração", description: "Configurar tabela salarial, benefícios, encargos, Elogio Premiado e PPR (Admin ou RH corporativo)", defaults: [A, R] },
  "pesquisa_salarial.view": { module: "Pesquisa salarial", description: "Acessar a pesquisa salarial e os indicadores de mercado", defaults: [A, R] },
  "pesquisa_salarial.manage": { module: "Pesquisa salarial", description: "Registrar salários de concorrentes e outros hotéis", defaults: [A, R] },
  "carreira.view": { module: "Cargos e carreira", description: "Ver cargos, descritivos e trilhas de carreira (sem salários)", defaults: [A, R, G] },
  "carreira.manage": { module: "Cargos e carreira", description: "Cadastrar descritivos de cargos e trilhas de carreira (Admin ou RH corporativo)", defaults: [A, R] },
  "carreira.movimentar": { module: "Cargos e carreira", description: "Registrar promoções, transferências, avaliações de promoção e PDI", defaults: [A, R] },
  "relatorios.view": { module: "Relatórios", description: "Acessar o dashboard gerencial (gestor: só as próprias vagas)", defaults: [A, R, G] },
  "relatorios.exportar": { module: "Relatórios", description: "Exportar indicadores em Excel e PDF", defaults: [A, R, G] },
  "relatorios.metas": { module: "Relatórios", description: "Configurar metas de SLA por cargo e departamento", defaults: [A, R] },
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
