import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, CpfField, Field, Submit } from "@/components/forms";
import { runAction, formToObject, type ActionState } from "@/modules/shared/action";
import { bootstrapAdmin, isBootstrapOpen } from "@/modules/auth/bootstrap";

export const metadata = { title: "Primeiro acesso" };
export const dynamic = "force-dynamic";

async function bootstrapAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const r = await runAction(async () => {
    await bootstrapAdmin(formToObject(fd));
    return "ok";
  });
  if (r?.ok) redirect("/login?ok=bootstrap");
  return r;
}

export default async function FirstAccessPage() {
  const open = await isBootstrapOpen();
  if (!open) {
    return (
      <AuthShell title="Primeiro acesso" subtitle="A configuração inicial já foi concluída ou não está habilitada.">
        <p className="text-sm text-stone-600">Novos acessos são cadastrados por um administrador ou pelo RH, dentro da plataforma.</p>
        <Link href="/login" className="btn-primary mt-6">Ir para o login</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Primeiro acesso" subtitle="Cadastro do administrador principal. Esta tela é desativada após o primeiro cadastro.">
      <ActionForm action={bootstrapAction} className="space-y-4">
        <CpfField label="Seu CPF" />
        <Field name="name" label="Nome completo" autoComplete="name" required />
        <Field name="email" label="E-mail" type="email" autoComplete="email" required hint="Usado para recuperar a senha." />
        <Field name="token" label="Código de configuração" type="password" autoComplete="off" required hint="O valor de BOOTSTRAP_TOKEN definido na Vercel." />
        <Field name="password" label="Crie sua senha" type="password" autoComplete="new-password" required hint="Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo." />
        <Field name="confirm" label="Confirme a senha" type="password" autoComplete="new-password" required />
        <Submit className="btn-primary w-full" pendingText="Criando…">Criar administrador</Submit>
      </ActionForm>
    </AuthShell>
  );
}
