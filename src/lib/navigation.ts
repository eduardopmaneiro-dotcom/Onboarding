import type { PermissionCode } from "@/lib/permissions";

/** Menu lateral — ordem e rótulos definidos na Fase 1. `ready=false` → módulo planejado. */
export const NAVIGATION: Array<{ href: string; label: string; icon: string; permission: PermissionCode; ready: boolean; phase?: string; description: string }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "dashboard.view", ready: true, description: "Visão geral" },
  { href: "/vagas", label: "Vagas", icon: "briefcase", permission: "vagas.view", ready: false, phase: "Fase 2 — Recrutamento", description: "Requisição, aprovação e divulgação de vagas por unidade e departamento." },
  { href: "/candidatos", label: "Candidatos", icon: "users", permission: "candidatos.view", ready: false, phase: "Fase 2 — Recrutamento", description: "Banco de talentos, triagem e pipeline de candidatos, com consentimento LGPD e retenção controlada." },
  { href: "/entrevistas", label: "Entrevistas", icon: "calendar", permission: "entrevistas.view", ready: false, phase: "Fase 2 — Recrutamento", description: "Agenda de entrevistas, roteiros estruturados e scorecards por competência." },
  { href: "/admissoes", label: "Admissões", icon: "clipboard", permission: "admissoes.view", ready: false, phase: "Fase 3 — Admissão", description: "Coleta de documentos, checklist admissional e integração ao onboarding de 90 dias." },
  { href: "/colaboradores", label: "Colaboradores", icon: "id", permission: "colaboradores.view", ready: false, phase: "Fase 3 — Admissão", description: "Cadastro de colaboradores CLT e PJ, histórico de movimentações e documentos." },
  { href: "/remuneracao", label: "Remuneração", icon: "money", permission: "remuneracao.view", ready: false, phase: "Fase 4 — Remuneração", description: "Faixas salariais por cargo e nível, simulações de mérito e promoção." },
  { href: "/pesquisa-salarial", label: "Pesquisa salarial", icon: "chart", permission: "pesquisa_salarial.view", ready: false, phase: "Fase 4 — Remuneração", description: "Comparação com o mercado hoteleiro do Rio de Janeiro por cargo do catálogo corporativo." },
  { href: "/cargos", label: "Cargos e carreira", icon: "ladder", permission: "carreira.view", ready: true, description: "Catálogo corporativo de cargos e trilhas de carreira." },
  { href: "/relatorios", label: "Relatórios", icon: "report", permission: "relatorios.view", ready: false, phase: "Fase 5 — Indicadores", description: "Indicadores de headcount, turnover, tempo de contratação e custo por contratação." },
  { href: "/configuracoes", label: "Configurações", icon: "gear", permission: "configuracoes.view", ready: true, description: "Estrutura organizacional, usuários, permissões, auditoria e sistema." },
];
