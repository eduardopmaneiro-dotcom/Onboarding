import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { NAVIGATION, NAV_GROUP_LABEL } from "@/lib/navigation";
import { can } from "@/lib/session";
import { pendingResults, pendingReviewCount } from "@/modules/recruitment/workflow";
import { ROLE_LABEL } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/trocar-senha");

  const unit = user.unitId ? await prisma.unit.findUnique({ where: { id: user.unitId }, select: { name: true } }) : null;
  const [reviews, results] = await Promise.all([pendingReviewCount(user), pendingResults(user).then((r) => r.length)]);
  const badges = { aprovacoes: reviews, resultados: results };
  const items = NAVIGATION.filter((n) => user.permissions.has(n.permission)).map(({ href, label, icon, ready, group, badge }) => ({
    href, label, icon, ready, group, groupLabel: NAV_GROUP_LABEL[group], badge: badge ? badges[badge] : undefined,
  }));
  const quickActions = can(user, "recrutamento.manage")
    ? [{ href: "/candidatos/novo", label: "+ Candidato" }, { href: "/entrevistas/agendar", label: "+ Entrevista" }]
    : [];

  async function logout() {
    "use server";
    await recordAudit({ entityType: "User", entityId: user.id, action: "LOGOUT", actorId: user.id, actorRole: user.role });
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={items} quickActions={quickActions} logout={logout} user={{ name: user.name, roleLabel: ROLE_LABEL[user.role], scope: unit?.name ?? "Todas as unidades" }} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-[1400px]">{children}</div></main>
    </div>
  );
}
