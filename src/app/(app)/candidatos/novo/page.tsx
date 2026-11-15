import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listJobs } from "@/modules/recruitment/jobs";
import { SOURCE_LABEL } from "@/modules/recruitment/constants";
import { CandidateForm } from "@/components/recruitment/candidate-form";
import { Card, PageHeader } from "@/components/ui";
import { saveCandidateAction } from "../../recrutamento/actions";

export const metadata = { title: "Novo candidato" };

export default async function NewCandidatePage({ searchParams }: { searchParams: Promise<{ vaga?: string; ok?: string }> }) {
  const user = await requirePermission("recrutamento.manage");
  const sp = await searchParams;
  const [jobs, positions] = await Promise.all([listJobs(user, { status: "ABERTA" }), prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } })]);
  return (
    <>
      <PageHeader title="Novo candidato" subtitle="Só o essencial: nome, telefone e a vaga. Se o candidato já existir, o sistema avisa antes de salvar." breadcrumb={{ href: "/candidatos", label: "Candidatos" }} />
      {sp.ok && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Candidato salvo. Cadastre o próximo.</p>}
      <Card className="max-w-3xl">
        <CandidateForm
          key={sp.ok ?? "novo"}
          action={saveCandidateAction}
          jobs={jobs.map((j) => ({ id: j.id, positionId: j.positionId, label: `${j.position.title} — ${j.department.unit.name} (${j.code})` }))}
          positions={positions}
          sources={SOURCE_LABEL}
          defaultJobId={sp.vaga}
        />
      </Card>
    </>
  );
}
