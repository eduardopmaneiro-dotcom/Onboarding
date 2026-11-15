import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Pesquisa salarial" };

export default function Page() {
  return <ComingSoon href="/pesquisa-salarial" prepared={["Cargos padronizados entre unidades (comparáveis com o mercado)", "Permissão pesquisa_salarial.view restrita", "Trilha de auditoria para exportações", "API interna /api/v1 para integrar fontes externas"]} />;
}
