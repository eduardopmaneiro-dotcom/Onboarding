import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Relatórios" };

export default function Page() {
  return <ComingSoon href="/relatorios" prepared={["Dados de estrutura, gestores e usuários consistentes e relacionados", "Permissão relatorios.view por perfil", "Ação EXPORT prevista na auditoria", "API interna para BI e integrações"]} />;
}
