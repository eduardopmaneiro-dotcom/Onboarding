import { requirePermission } from "@/lib/session";
import { todayKey } from "@/lib/datetime";
import { jobFormOptions } from "@/modules/recruitment/jobs";
import { JOB_STATUS_EDITABLE, JOB_STATUS_LABEL, SCHEDULE_LABEL, SHIFT_LABEL } from "@/modules/recruitment/constants";
import { JobForm } from "@/components/recruitment/job-form";
import { Card, PageHeader } from "@/components/ui";
import { saveJobAction } from "../../recrutamento/actions";

export const metadata = { title: "Nova vaga" };

export default async function NewJobPage() {
  const user = await requirePermission("recrutamento.manage");
  const options = await jobFormOptions(user);
  const status = Object.fromEntries(JOB_STATUS_EDITABLE.map((s) => [s, JOB_STATUS_LABEL[s]]));
  return (
    <>
      <PageHeader title="Nova vaga" subtitle="O código da vaga é gerado automaticamente ao salvar." breadcrumb={{ href: "/vagas", label: "Vagas" }} />
      <Card className="max-w-4xl">
        <JobForm action={saveJobAction} options={options} today={todayKey()} labels={{ schedule: SCHEDULE_LABEL, shift: SHIFT_LABEL, status }} />
      </Card>
    </>
  );
}
