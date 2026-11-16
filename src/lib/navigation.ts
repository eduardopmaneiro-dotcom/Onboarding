import type { PermissionCode } from "@/lib/permissions";

export type NavGroup = "inicio" | "recrutamento" | "pessoas" | "remuneracao" | "gestao";

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  inicio: "",
  recrutamento: "Recrutamento e seleção",
  pessoas: "Pessoas",
  remuneracao: "Remuneração",
  gestao: "Gestão",
};

/**
 * Menu lateral. Agrupado por processo (o que o RH faz no dia a dia vem primeiro).
 * `ready=false` → módulo planejado, exibido no grupo "Próximas fases".
 * `badge` → contador de pendências calculado no layout.
 */
export const NAVIGATION: Array<{
  href: string; label: string; icon: string; permission: PermissionCode; ready: boolean; group: NavGroup; phase?: string; description: string; badge?: "aprovacoes" | "resultados" | "comunicacoes" | "admissoes" | "experiencia";
}> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "dashboard.view", ready: true, group: "inicio", description: "O que precisa da sua atenção hoje" },
  { href: "/vagas", label: "Vagas", icon: "briefcase", permission: "vagas.view", ready: true, group: "recrutamento", description: "Vagas abertas por unidade, departamento e gestor." },
  { href: "/candidatos", label: "Candidatos", icon: "users", permission: "candidatos.view", ready: true, group: "recrutamento", description: "Cadastro, histórico e negociação salarial dos candidatos." },
  { href: "/entrevistas", label: "Entrevistas", icon: "calendar", permission: "entrevistas.view", ready: true, group: "recrutamento", description: "Agenda diária, semanal e mensal e registro de resultados.", badge: "resultados" },
  { href: "/aprovacoes", label: "Aprovação do gestor", icon: "check", permission: "aprovacoes.view", ready: true, group: "recrutamento", description: "Candidatos aprovados pelo RH aguardando o gestor.", badge: "aprovacoes" },
  { href: "/comunicacoes", label: "Comunicação com gestores", icon: "mail", permission: "comunicacoes.view", ready: true, group: "recrutamento", description: "Avisos de agenda, fechamento do dia e histórico de e-mails.", badge: "comunicacoes" },
  { href: "/recrutamento/importar", label: "Importar planilha", icon: "upload", permission: "importacao.executar", ready: true, group: "recrutamento", description: "Importação do histórico da planilha do RH." },
  { href: "/admissoes", label: "Admissões", icon: "clipboard", permission: "admissoes.view", ready: true, group: "pessoas", description: "Checklist documental, exame admissional e confirmação da contratação.", badge: "admissoes" },
  { href: "/colaboradores", label: "Colaboradores", icon: "id", permission: "colaboradores.view", ready: true, group: "pessoas", description: "Colaboradores, tempo de casa, experiência (30/45/90) e desligamentos.", badge: "experiencia" },
  { href: "/remuneracao", label: "Remuneração", icon: "money", permission: "remuneracao.view", ready: false, group: "remuneracao", phase: "Fase 4 — Remuneração", description: "Faixas salariais por cargo e nível, simulações de mérito e promoção." },
  { href: "/pesquisa-salarial", label: "Pesquisa salarial", icon: "chart", permission: "pesquisa_salarial.view", ready: false, group: "remuneracao", phase: "Fase 4 — Remuneração", description: "Comparação com o mercado hoteleiro do Rio de Janeiro por cargo do catálogo corporativo." },
  { href: "/cargos", label: "Cargos e carreira", icon: "ladder", permission: "carreira.view", ready: true, group: "gestao", description: "Catálogo corporativo de cargos e trilhas de carreira." },
  { href: "/relatorios", label: "Relatórios", icon: "report", permission: "relatorios.view", ready: true, group: "gestao", description: "Dashboard gerencial: recrutamento, conversão, produtividade, SLA, permanência e turnover." },
  { href: "/configuracoes", label: "Configurações", icon: "gear", permission: "configuracoes.view", ready: true, group: "gestao", description: "Estrutura organizacional, usuários, permissões, auditoria e sistema." },
];
