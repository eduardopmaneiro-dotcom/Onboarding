import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Entrevistas" };

export default function Page() {
  return <ComingSoon href="/entrevistas" prepared={["Tabela Interview ligada à candidatura e ao gestor entrevistador", "Tipos: triagem RH, técnica, gestor e final", "Status e nota por entrevista", "E-mail do gestor pronto para convites automáticos"]} />;
}
