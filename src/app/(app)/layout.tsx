import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { can } from "@/lib/rbac";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/colaboradores", label: "Colaboradores" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/carreira", label: "Plano de Carreira" },
  { href: "/checklists", label: "Checklists" },
  { href: "/pdi", label: "PDI" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = session!.user.role;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold text-slate-900">Rede Riale</p>
          <p className="text-xs text-slate-500">{role.replace("_", " ")}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
          {can(role, "viewAudit") && (
            <Link
              href="/auditoria"
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Auditoria
            </Link>
          )}
          {can(role, "manageTemplates") && (
            <Link
              href="/admin"
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Administração
            </Link>
          )}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <p className="truncate px-3 text-xs text-slate-500">
            {session!.user.email}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
