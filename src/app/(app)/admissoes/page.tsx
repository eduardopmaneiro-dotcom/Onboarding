import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Admissões" };

export default function Page() {
  return <ComingSoon href="/admissoes" prepared={["Vínculo candidato → colaborador contratado", "Template de onboarding de 90 dias (8 etapas) já carregado", "Histórico de movimentações (ADMISSAO) imutável", "Armazenamento protegido de documentos admissionais"]} />;
}
