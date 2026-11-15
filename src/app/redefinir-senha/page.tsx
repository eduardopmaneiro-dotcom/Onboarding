import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Field, Submit } from "@/components/forms";
import { resetPasswordAction } from "../recuperar-senha/actions";

export const metadata = { title: "Redefinir senha" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Nova senha" subtitle="Mínimo de 10 caracteres com maiúscula, minúscula e número (administradores: 12 caracteres e um símbolo).">
      {!token ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Link inválido. Solicite uma nova recuperação.</p>
      ) : (
        <ActionForm action={resetPasswordAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <Field name="password" label="Nova senha" type="password" autoComplete="new-password" required />
          <Field name="confirm" label="Confirme a nova senha" type="password" autoComplete="new-password" required />
          <Submit className="btn-primary w-full">Redefinir senha</Submit>
        </ActionForm>
      )}
      <Link href="/login" className="mt-6 block text-sm font-medium text-gold-600 hover:underline">← Voltar ao login</Link>
    </AuthShell>
  );
}
