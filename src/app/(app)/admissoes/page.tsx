import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { fmtDate } from "@/lib/datetime";
import { isApplicable, isRequired, listAdmissions, readyForAdmission } from "@/modules/admission/service";
import { ADMISSION_STATUS_LABEL, ADMISSION_STATUS_TONE, examSituation } from "@/modules/admission/constants";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { forwardAction } from "./actions";

export const metadata = { title: "Admissões" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "EM_ANDAMENTO", label: "Em andamento" },
  { key: "CONCLUIDA", label: "Concluídas" },
  { key: "CANCELADA", label: "Canceladas" },
] as const;

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePermission("admissoes.view");
  const sp = await searchParams;
  const status = (TABS.find((t) => t.key === sp.status)?.key ?? "EM_ANDAMENTO") as (typeof TABS)[number]["key"];
  const manage = can(user, "admissoes.manage");
  const [ready, list] = await Promise.all([readyForAdmission(user), listAdmissions(user, status)]);

  return (
    <>
      <PageHeader
        title="Admissões"
        subtitle="Do “aprovado em todas as etapas” ao colaborador: documentos, exame admissional e dados da contratação."
        actions={can(user, "admissoes.config") && <Link href="/admissoes/configuracoes" className="btn-ghost">Checklist, clínicas e regras</Link>}
      />

      <Card title={`Prontos para admissão (${ready.length})`} className="mb-6">
        {ready.length === 0 ? <Empty>Nenhum candidato com aprovação final aguardando admissão.</Empty> : (
          <ul className="divide-y divide-stone-100">
            {ready.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="text-sm">
                  <Link href={`/candidatos/${a.candidate.id}`} className="font-medium text-riale-900 hover:underline">{a.candidate.fullName}</Link>
                  <span className="block text-xs text-stone-500">{a.jobOpening.position.title} · {a.jobOpening.department.name} · {a.jobOpening.department.unit.name} · aprovação final em {fmtDate(a.approvedAt)}</span>
                </span>
                {manage && (
                  <ActionForm action={forwardAction}>
                    <input type="hidden" name="applicationId" value={a.id} />
                    <Submit className="btn-primary btn-sm" pendingText="Abrindo…">Encaminhar para admissão</Submit>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-3 flex gap-1 text-sm">
        {TABS.map((t) => (
          <Link key={t.key} href={`?status=${t.key}`} className={`rounded-lg px-3 py-1.5 ${status === t.key ? "bg-riale-800 text-white" : "text-stone-600 hover:bg-riale-50"}`}>{t.label}</Link>
        ))}
      </div>
      <Card>
        {list.length === 0 ? <Empty>Nenhum processo {ADMISSION_STATUS_LABEL[status].toLowerCase()}.</Empty> : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead className="bg-riale-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-5 py-2">Processo</th><th className="px-3 py-2">Candidato</th><th className="px-3 py-2">Cargo / unidade</th><th className="px-3 py-2">Admissão</th><th className="px-3 py-2">Documentos</th><th className="px-3 py-2">Exame</th><th className="px-5 py-2">Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {list.map((a) => {
                  const req = a.documents.filter((d) => isRequired(a, d.docType) && (d.docType.active || d.status !== "PENDENTE"));
                  const ok = req.filter((d) => d.status === "APROVADO").length;
                  const refused = a.documents.filter((d) => d.status === "RECUSADO" && isApplicable(a, d.docType)).length;
                  const ex = a.exams[0];
                  const sit = ex ? examSituation(ex) : null;
                  return (
                    <tr key={a.id} className="hover:bg-riale-50/50">
                      <td className="px-5 py-2.5"><Link href={`/admissoes/${a.id}`} className="font-mono text-xs text-riale-900 hover:underline">{a.code}</Link></td>
                      <td className="px-3 py-2.5"><Link href={`/admissoes/${a.id}`} className="font-medium text-riale-900 hover:underline">{a.candidate.fullName}</Link></td>
                      <td className="px-3 py-2.5 text-stone-600">{a.position.title}<span className="block text-xs text-stone-400">{a.department.name} · {a.department.unit.name}</span></td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtDate(a.admissionDate)}</td>
                      <td className="px-3 py-2.5"><span className="tabular-nums">{ok}/{req.length}</span> aprovados{refused > 0 && <span className="block text-xs text-red-700">{refused} recusado(s)</span>}</td>
                      <td className="px-3 py-2.5">{sit ? <Badge tone={sit.tone}>{sit.label}</Badge> : <span className="text-xs text-stone-400">não agendado</span>}</td>
                      <td className="px-5 py-2.5"><Badge tone={ADMISSION_STATUS_TONE[a.status]}>{ADMISSION_STATUS_LABEL[a.status]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
