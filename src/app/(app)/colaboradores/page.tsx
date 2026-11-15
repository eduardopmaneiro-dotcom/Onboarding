import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Colaboradores" };

export default function Page() {
  return <ComingSoon href="/colaboradores" prepared={["Tabela Employee (CLT, PJ, estágio, temporário)", "Vínculo com departamento, cargo do catálogo e gestor", "Histórico de movimentações somente-inserção", "Modelos de PDI, avaliações D45/D90 e PDL preservados"]} />;
}
