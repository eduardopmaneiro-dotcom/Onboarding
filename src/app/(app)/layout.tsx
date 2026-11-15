import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { NAVIGATION } from "@/lib/navigation";
import { ROLE_LABEL } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/trocar-senha");

  const unit = user.unitId ? await prisma.unit.findUnique({ where: { id: user.unitId }, select: { name: true } }) : null;
  const items = NAVIGATION.filter((n) => user.permissions.has(n.permission)).map(({ href, label, icon, ready }) => ({ href, label, icon, ready }));

  async function logout() {
    "use server";
    await recordAudit({ entityType: "User", entityId: user.id, action: "LOGOUT", actorId: user.id, actorRole: user.role });
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={items} logout={logout} user={{ name: user.name, roleLabel: ROLE_LABEL[user.role], scope: unit?.name ?? "Todas as unidades" }} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
