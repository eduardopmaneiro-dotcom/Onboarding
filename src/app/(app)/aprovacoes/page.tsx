import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/datetime";
import { formatMoney, formatPhone } from "@/lib/text";
import { listReasons, listReviews } from "@/modules/recruitment/workflow";
import { salaryGap } from "@/modules/recruitment/candidates";
import { DECISION_LABEL, EXTERNAL_LABEL, RESULT_LABEL, RESULT_TONE } from "@/modules/recruitment/constants";
import { DecisionPanel } from "@/components/recruitment/decision-panel";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { decisionAction } from "../recrutamento/actions";

export const metadata = { title: "Aprovação do gestor" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const user = await requirePermission("aprovacoes.view");
  const sp = await searchParams;
  const tab = sp.ver === "decididas" ? "DECIDIDAS" : "PENDENTE";
  const [reviews, reasons] = await Promise.all([listReviews(user, tab), listReasons()]);
  const salary = can(user, "recrutamento.salarios");

  return (
    <>
      <PageHeader
        title="Aprovação do gestor"
        subtitle={user.role === "GESTOR" ? "Candidatos aprovados pelo RH para as suas vagas. Aprove, reprove (com justificativa) ou peça nova entrevista." : "Candidatos aprovados pelo RH aguardando a decisão do gestor responsável."}
      />
      <div className="mb-4 flex gap-2">
        <Link href="?" className={`chip ${tab === "PENDENTE" ? "chip-active" : ""}`}>Aguardando decisão</Link>
        <Link href="?ver=decididas" className={`chip ${tab === "DECIDIDAS" ? "chip-active" : ""}`}>Decididas</Link>
      </div>
      {reviews.length === 0 ? (
        <Card><Empty>{tab === "PENDENTE" ? "Nenhum candidato aguardando decisão." : "Nenhuma decisão registrada ainda."}</Empty></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reviews.map((r) => {
            const a = r.application;
            const rh = a.interviews.find((i) => i.result !== "PENDENTE") ?? a.interviews[0];
            const gap = salaryGap(a.offeredSalary, a.expectedSalary);
            const isOwner = !!user.managerId && user.managerId === r.managerId && can(user, "aprovacoes.decidir");
            const onBehalf = !isOwner && can(user, "aprovacoes.registrar");
            return (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/candidatos/${a.candidate.id}`} className="font-serif text-xl text-riale-900 hover:underline">{a.candidate.fullName}</Link>
                    <p className="text-sm text-stone-600">{a.jobOpening.position.title} · {a.jobOpening.department.unit.name} › {a.jobOpening.department.name}</p>
                    <p className="text-xs text-stone-400">{formatPhone(a.candidate.phone)} · {a.jobOpening.code}</p>
                  </div>
                  <Badge tone={r.status === "PENDENTE" ? "gold" : r.status === "APROVADO" ? "green" : r.status === "REPROVADO" ? "red" : "blue"}>{DECISION_LABEL[r.status]}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-riale-50 p-3 text-xs">
                  <div><dt className="text-stone-500">Resultado do RH</dt><dd>{rh ? <Badge tone={RESULT_TONE[rh.result]}>{RESULT_LABEL[rh.result]}</Badge> : "—"}</dd></div>
                  <div><dt className="text-stone-500">Entrevista</dt><dd className="text-riale-900">{rh ? `${fmtDateTime(rh.scheduledAt, rh.hasTime)} · ${rh.interviewerName ?? "—"}` : "—"}</dd></div>
                  {rh?.resultNote && <div className="col-span-2"><dt className="text-stone-500">Parecer do RH</dt><dd className="text-stone-700">{rh.resultNote}</dd></div>}
                  {salary && (a.offeredSalary || a.expectedSalary) && (
                    <div className="col-span-2"><dt className="text-stone-500">Salário</dt><dd className="text-stone-700">Oferta {formatMoney(a.offeredSalary)} · pretensão {formatMoney(a.expectedSalary)}{gap && <span className={gap.value > 0 ? "text-red-700" : "text-emerald-700"}> ({gap.pct > 0 ? "+" : ""}{gap.pct.toFixed(1)}%)</span>}</dd></div>
                  )}
                  {a.externalCheckStatus !== "NAO_APLICA" && <div className="col-span-2"><dt className="text-stone-500">Avaliação externa</dt><dd>{EXTERNAL_LABEL[a.externalCheckStatus]}</dd></div>}
                  <div className="col-span-2"><dt className="text-stone-500">Gestor responsável</dt><dd className="text-stone-700">{r.manager?.name ?? <span className="text-red-600">não definido na vaga</span>}{r.manager && !r.manager.userId && " (sem acesso ao sistema)"}</dd></div>
                </dl>
                {r.status === "PENDENTE" ? (
                  isOwner || onBehalf ? (
                    <div className="mt-4"><DecisionPanel action={decisionAction} reviewId={r.id} reasons={reasons} onBehalfOf={onBehalf ? (r.manager?.name ?? "gestor") : null} /></div>
                  ) : <p className="mt-4 text-xs text-stone-500">Aguardando {r.manager?.name ?? "o gestor"}. Encaminhado em {fmtDateTime(r.requestedAt)}.</p>
                ) : (
                  <p className="mt-4 text-sm text-stone-600">{r.justification ?? "Sem comentário."}<span className="block text-xs text-stone-400">{fmtDateTime(r.decidedAt)} · {r.decidedBy?.name}{r.onBehalf ? " (em nome do gestor)" : ""}</span></p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
