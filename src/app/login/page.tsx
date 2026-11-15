import Link from "next/link";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { CpfInput } from "@/components/cpf-input";
import { isBootstrapOpen } from "@/modules/auth/bootstrap";

export const metadata = { title: "Entrar" };

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", { cpf: formData.get("cpf"), password: formData.get("password"), redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      const code = (err as AuthError & { code?: string }).code === "locked" ? "locked" : "invalid";
      redirect(`/login?error=${code}`);
    }
    throw err;
  }
}

const MESSAGES: Record<string, { tone: "red" | "green"; text: string }> = {
  invalid: { tone: "red", text: "CPF ou senha inválidos." },
  locked: { tone: "red", text: "Acesso temporariamente bloqueado por excesso de tentativas. Tente novamente em 15 minutos ou use “Esqueci minha senha”." },
  reset: { tone: "green", text: "Senha redefinida com sucesso. Entre com a nova senha." },
  changed: { tone: "green", text: "Senha alterada. Entre novamente com a nova senha." },
  bootstrap: { tone: "green", text: "Administrador criado. Entre com seu CPF e a senha que você definiu." },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const msg = MESSAGES[error ?? ok ?? ""];
  const firstAccess = await isBootstrapOpen();
  return (
    <AuthShell title="Entrar" subtitle="Use seu CPF e sua senha pessoal.">
      {firstAccess && (
        <Link href="/primeiro-acesso" className="mb-5 block rounded-md border border-gold-400 bg-gold-100 px-3 py-2 text-sm text-gold-600 hover:bg-gold-100/70">
          Plataforma ainda sem usuários. <strong>Fazer o primeiro acesso →</strong>
        </Link>
      )}
      {msg && <p className={`mb-5 rounded-md px-3 py-2 text-sm ${msg.tone === "red" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{msg.text}</p>}
      <form action={login} className="space-y-4">
        <div>
          <label htmlFor="cpf" className="label">CPF</label>
          <CpfInput />
        </div>
        <div>
          <label htmlFor="password" className="label">Senha</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <button type="submit" className="btn-primary w-full">Entrar</button>
      </form>
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/recuperar-senha" className="font-medium text-gold-600 hover:underline">Esqueci minha senha</Link>
        <span className="text-xs text-slate-400">Primeiro acesso? Fale com o RH.</span>
      </div>
    </AuthShell>
  );
}
