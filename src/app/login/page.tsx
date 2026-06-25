import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw err;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        action={login}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">Rede Riale</h1>
        <p className="mt-1 text-sm text-slate-500">
          Onboarding &amp; Plano de Carreira
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            E-mail ou senha inválidos.
          </p>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="voce@rialehoteis.com.br"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              name="password"
              type="password"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
