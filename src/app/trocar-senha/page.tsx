import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Field, Submit } from "@/components/forms";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { runAction, type ActionState } from "@/modules/shared/action";
import { changeOwnPassword } from "@/modules/auth/service";

export const metadata = { title: "Alterar senha" };

async function changeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireUser();
  const r = await runAction(async () => {
    await changeOwnPassword(user, String(fd.get("current") ?? ""), String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
    return "ok";
  });
  if (r?.ok) {
    await signOut({ redirect: false });
    redirect("/login?ok=changed");
  }
  return r;
}

export default async function ChangePasswordPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  return (
    <AuthShell
      title={user.mustChangePassword ? "Defina sua senha" : "Alterar senha"}
      subtitle={user.mustChangePassword ? "Por segurança, troque a senha inicial antes de continuar." : "Após a troca, você entrará novamente."}
    >
      <ActionForm action={changeAction} className="space-y-4">
        <Field name="current" label="Senha atual" type="password" autoComplete="current-password" required />
        <Field
          name="password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          required
          hint={user.role === "ADMIN" ? "Mínimo 12 caracteres, maiúscula, minúscula, número e símbolo." : "Mínimo 10 caracteres, maiúscula, minúscula e número."}
        />
        <Field name="confirm" label="Confirme a nova senha" type="password" autoComplete="new-password" required />
        <Submit className="btn-primary w-full">Salvar nova senha</Submit>
      </ActionForm>
      {!user.mustChangePassword && <Link href="/dashboard" className="mt-6 block text-sm font-medium text-gold-600 hover:underline">← Voltar</Link>}
    </AuthShell>
  );
}
