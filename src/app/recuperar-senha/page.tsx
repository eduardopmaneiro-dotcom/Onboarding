import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, CpfField, Field, Submit } from "@/components/forms";
import { requestResetAction } from "./actions";

export const metadata = { title: "Recuperar senha" };

export default function RecoverPage() {
  return (
    <AuthShell title="Recuperar senha" subtitle="Informe seu CPF e o e-mail cadastrado. Enviaremos um link de redefinição.">
      <ActionForm action={requestResetAction} className="space-y-4" resetOnSuccess>
        <CpfField />
        <Field name="email" label="E-mail cadastrado" type="email" autoComplete="email" required />
        <Submit className="btn-primary w-full" pendingText="Enviando…">Enviar link</Submit>
      </ActionForm>
      <Link href="/login" className="mt-6 block text-sm font-medium text-gold-600 hover:underline">← Voltar ao login</Link>
    </AuthShell>
  );
}
