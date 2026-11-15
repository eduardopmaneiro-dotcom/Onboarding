import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Remuneração" };

export default function Page() {
  return <ComingSoon href="/remuneracao" prepared={["Catálogo corporativo de cargos por nível (N1–N7)", "Permissão remuneracao.view restrita a Admin e RH", "Histórico de alteração salarial previsto (ALTERACAO_SALARIAL)", "Score de promoção (pesos RH-CAR-01) já modelado"]} />;
}
