import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Acesso negado" };

export default function Denied() {
  return (
    <AuthShell title="Acesso negado" subtitle="Seu perfil não tem permissão para esta área. A tentativa foi registrada.">
      <Link href="/dashboard" className="btn-primary">Voltar ao dashboard</Link>
    </AuthShell>
  );
}
