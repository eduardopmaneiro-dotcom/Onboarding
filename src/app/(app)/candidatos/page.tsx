import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Candidatos" };

export default function Page() {
  return <ComingSoon href="/candidatos" prepared={["Tabela Candidate com CPF protegido (hash + cifra)", "Consentimento LGPD (data e versão do aviso) e prazo de retenção", "Candidaturas (Application) ligando candidato a várias vagas", "Documentos cifrados (currículos) com download auditado"]} />;
}
