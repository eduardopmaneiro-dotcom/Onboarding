import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Vagas" };

export default function Page() {
  return <ComingSoon href="/vagas" prepared={["Tabela JobOpening (vaga ↔ cargo, departamento e gestor requisitante)", "Status do ciclo da vaga: rascunho → aprovação → aberta → preenchida", "Permissão vagas.view por perfil", "Fila de notificações para avisar gestores por e-mail"]} />;
}
