import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { todayKey } from "@/lib/datetime";
import { listJobs } from "@/modules/recruitment/jobs";
import { listInterviewers } from "@/modules/recruitment/workflow";
import { candidateScopeWhere } from "@/modules/recruitment/scope";
import { ScheduleForm } from "@/components/recruitment/schedule-form";
import { PageHeader } from "@/components/ui";
import { scheduleAction } from "../../recrutamento/actions";

export const metadata = { title: "Agendar entrevista" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ vaga?: string; candidato?: string; data?: string }> }) {
  const user = await requirePermission("recrutamento.manage");
  const sp = await searchParams;
  const [jobs, interviewers, candidates] = await Promise.all([
    listJobs(user, { status: "ativas" }),
    listInterviewers(),
    prisma.candidate.findMany({
      where: { ...candidateScopeWhere(user), anonymizedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { id: true, fullName: true, phone: true, applications: { select: { jobOpeningId: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader title="Agendar entrevistas" subtitle="Unidade, departamento e gestor são preenchidos pela vaga. Selecione vários candidatos para agendar em lote." breadcrumb={{ href: "/entrevistas", label: "Entrevistas" }} />
      <ScheduleForm
        action={scheduleAction}
        jobs={jobs.filter((j) => j.status === "ABERTA" || j.status === "PAUSADA").map((j) => ({ id: j.id, label: `${j.position.title} — ${j.department.unit.name} (${j.code})`, unit: j.department.unit.name, department: j.department.name, manager: j.requestingManager?.name ?? null }))}
        candidates={candidates.map((c) => ({ id: c.id, name: c.fullName, phone: c.phone, jobIds: c.applications.map((a) => a.jobOpeningId) }))}
        interviewers={interviewers}
        me={user.id}
        defaults={{ jobId: sp.vaga, candidateIds: sp.candidato ? [sp.candidato] : [], date: sp.data ?? todayKey(), time: "09:00" }}
      />
    </>
  );
}
