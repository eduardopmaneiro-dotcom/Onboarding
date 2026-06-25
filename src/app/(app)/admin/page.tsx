import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth();
  if (!can(session!.user.role, "manageTemplates")) redirect("/dashboard");

  const templates = await prisma.onboardingTemplate.findMany({
    include: { stages: { orderBy: { order: "asc" } }, position: true },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Administração</h1>
      <p className="mt-1 text-sm text-slate-500">
        Templates oficiais de onboarding. Apenas ADMIN/RH_CORPORATIVO podem alterar a estrutura —
        alterações ficam registradas na trilha de auditoria.
      </p>

      <div className="mt-6 space-y-4">
        {templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-medium text-slate-900">
              {t.name} {t.position ? `· ${t.position.title}` : "· Geral"}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {t.stages.map((s) => (
                <li key={s.id}>
                  {s.name} — D{s.dayRangeStart} a D{s.dayRangeEnd} ({s.period.replace(/_/g, " ")})
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
