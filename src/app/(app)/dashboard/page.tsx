import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/session";
import { addDays, fmtDateTime, localToDate, timeKey, todayKey } from "@/lib/datetime";
import { ROLE_LABEL } from "@/lib/permissions";
import { listInterviews, listReviews, pendingResults } from "@/modules/recruitment/workflow";
import { jobScopeWhere } from "@/modules/recruitment/scope";
import { RESULT_LABEL, RESULT_TONE } from "@/modules/recruitment/constants";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { myAlerts } from "@/modules/people/alerts";
import { readyForAdmission, listAdmissions } from "@/modules/admission/service";
import { readAlertAction } from "../colaboradores/actions";

export const metadata = { title: "Dashboard" };

function Kpi({ href, label, value, hint, tone = "default" }: { href: string; label: string; value: number | string; hint?: string; tone?: "default" | "alert" }) {
  return (
    <Link href={href} className={`card block p-5 transition hover:border-gold-400 hover:shadow-md ${tone === "alert" && Number(value) > 0 ? "border-gold-400 bg-gold-100/40" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-serif text-4xl font-semibold text-riale-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </Link>
  );
}

export default async function Dashboard() {
  const user = await requirePermission("dashboard.view");
  const today = todayKey();
  const jobs = jobScopeWhere(user);
  const since = localToDate(addDays(today, -30));
  const [todayList, pending, reviews, openJobs, externalWaiting, last30, reasonsAgg, reasonList] = await Promise.all([
    can(user, "entrevistas.view") ? listInterviews(user, localToDate(today), localToDate(addDays(today, 1))) : Promise.resolve([]),
    pendingResults(user),
    can(user, "aprovacoes.view") ? listReviews(user, "PENDENTE") : Promise.resolve([]),
    prisma.jobOpening.count({ where: { ...jobs, status: "ABERTA" } }),
    prisma.application.count({ where: { jobOpening: jobs, externalCheckStatus: "AGUARDANDO" } }),
    prisma.interview.groupBy({ by: ["result"], _count: true, where: { application: { jobOpening: jobs }, scheduledAt: { gte: since }, status: { not: "CANCELADA" } } }),
    prisma.interview.groupBy({ by: ["reasonId"], _count: true, where: { application: { jobOpening: jobs }, result: "REPROVADO", reasonId: { not: null } }, orderBy: { _count: { reasonId: "desc" } }, take: 6 }),
    prisma.rejectionReason.findMany(),
  ]);
  const [alerts, ready, inAdmission] = await Promise.all([
    myAlerts(user, 8),
    can(user, "admissoes.view") ? readyForAdmission(user) : Promise.resolve([]),
    can(user, "admissoes.view") ? listAdmissions(user, "EM_ANDAMENTO") : Promise.resolve([]),
  ]);
  const total30 = last30.reduce((s, x) => s + x._count, 0);
  const approved30 = last30.find((x) => x.result === "APROVADO")?._count ?? 0;
  const decided30 = last30.filter((x) => x.result !== "PENDENTE").reduce((s, x) => s + x._count, 0);
  const maxReason = Math.max(1, ...reasonsAgg.map((r) => r._count));
  const gestor = user.role === "GESTOR";

  return (
    <>
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}`} subtitle={`${ROLE_LABEL[user.role]} · ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" }).format(new Date())}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {gestor ? (
          <>
            <Kpi href="/aprovacoes" label="Aguardando sua decisão" value={reviews.length} tone="alert" hint="Candidatos aprovados pelo RH" />
            <Kpi href="/vagas" label="Suas vagas abertas" value={openJobs} />
            <Kpi href="/entrevistas?visao=dia" label="Entrevistas hoje" value={todayList.length} />
            <Kpi href="/entrevistas" label="Entrevistas (30 dias)" value={total30} />
          </>
        ) : (
          <>
            <Kpi href="/entrevistas?visao=dia" label="Entrevistas hoje" value={todayList.length} />
            <Kpi href="#pendentes" label="Resultados a registrar" value={pending.length} tone="alert" hint="Entrevistas passadas sem resultado" />
            <Kpi href="/aprovacoes" label="Aguardando gestor" value={reviews.length} tone="alert" />
            <Kpi href="/vagas" label="Vagas abertas" value={openJobs} hint={externalWaiting ? `${externalWaiting} candidato(s) na avaliação externa` : undefined} />
          </>
        )}
      </div>

      {(alerts.length > 0 || ready.length > 0 || inAdmission.length > 0) && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card title={`Alertas da experiência (${alerts.length})`} actions={<Link href="/colaboradores/experiencia" className="text-xs font-medium text-gold-600 hover:underline">acompanhamento →</Link>}>
            {alerts.length === 0 ? <Empty>Nenhum alerta novo.</Empty> : (
              <ul className="divide-y divide-stone-100">
                {alerts.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-alert>
                    <Link href={n.relatedId ? `/colaboradores/${n.relatedId}` : "/colaboradores/experiencia"} className="hover:underline"><span className="font-medium text-riale-900">{n.subject}</span><span className="block text-xs text-stone-400">{n.body}</span></Link>
                    <form action={readAlertAction}><input type="hidden" name="id" value={n.id} /><button className="text-xs text-stone-500 hover:underline">marcar como lido</button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Admissões" actions={<Link href="/admissoes" className="text-xs font-medium text-gold-600 hover:underline">abrir →</Link>}>
            <dl className="grid grid-cols-2 gap-4 text-center">
              <div><dt className="text-xs text-stone-500">Prontos para admissão</dt><dd className="font-serif text-3xl text-riale-900">{ready.length}</dd></div>
              <div><dt className="text-xs text-stone-500">Processos em andamento</dt><dd className="font-serif text-3xl text-riale-900">{inAdmission.length}</dd></div>
            </dl>
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Entrevistas de hoje" actions={<Link href="/entrevistas?visao=dia" className="text-xs font-medium text-gold-600 hover:underline">abrir agenda →</Link>}>
          {todayList.length === 0 ? <Empty>Nenhuma entrevista hoje.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {todayList.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-12 font-mono text-sm text-riale-900">{i.hasTime ? timeKey(i.scheduledAt) : "—"}</span>
                  <Link href={`/entrevistas/${i.id}`} className="flex-1 text-sm hover:underline"><span className="font-medium text-riale-900">{i.application.candidate.fullName}</span><span className="block text-xs text-stone-400">{i.application.jobOpening.position.title} · {i.application.jobOpening.department.unit.name}</span></Link>
                  <Badge tone={RESULT_TONE[i.result]}>{RESULT_LABEL[i.result]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {gestor ? (
          <Card title="Candidatos aguardando sua decisão" actions={<Link href="/aprovacoes" className="text-xs font-medium text-gold-600 hover:underline">decidir →</Link>}>
            {reviews.length === 0 ? <Empty>Nada pendente.</Empty> : (
              <ul className="divide-y divide-stone-100">{reviews.slice(0, 8).map((r) => <li key={r.id} className="py-2.5 text-sm"><Link href="/aprovacoes" className="font-medium text-riale-900 hover:underline">{r.application.candidate.fullName}</Link><span className="block text-xs text-stone-400">{r.application.jobOpening.position.title} · desde {fmtDateTime(r.requestedAt)}</span></li>)}</ul>
            )}
          </Card>
        ) : (
          <Card title="Resultados a registrar" actions={pending.length > 0 && <span className="text-xs text-stone-400">mais antigos primeiro</span>}>
            <div id="pendentes" />
            {pending.length === 0 ? <Empty>Tudo em dia.</Empty> : (
              <ul className="divide-y divide-stone-100">
                {pending.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span><span className="font-medium text-riale-900">{i.application.candidate.fullName}</span><span className="block text-xs text-stone-400">{i.application.jobOpening.position.title} · {fmtDateTime(i.scheduledAt, i.hasTime)}</span></span>
                    <Link href={`/entrevistas/${i.id}`} className="btn-primary btn-sm">Registrar</Link>
                  </li>
                ))}
                {pending.length > 8 && <li className="pt-2 text-xs text-stone-500">e mais {pending.length - 8}…</li>}
              </ul>
            )}
          </Card>
        )}
      </div>

      {!gestor && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card title="Últimos 30 dias">
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div><dt className="text-xs text-stone-500">Entrevistas</dt><dd className="font-serif text-3xl text-riale-900">{total30}</dd></div>
              <div><dt className="text-xs text-stone-500">Com resultado</dt><dd className="font-serif text-3xl text-riale-900">{decided30}</dd></div>
              <div><dt className="text-xs text-stone-500">Aprovação RH</dt><dd className="font-serif text-3xl text-riale-900">{decided30 ? `${Math.round((approved30 / decided30) * 100)}%` : "—"}</dd></div>
            </dl>
          </Card>
          <Card title="Principais motivos de reprovação (histórico)">
            {reasonsAgg.length === 0 ? <Empty>Sem reprovações registradas.</Empty> : (
              <ul className="space-y-2">
                {reasonsAgg.map((r) => (
                  <li key={r.reasonId} className="text-sm">
                    <div className="flex justify-between"><span className="text-stone-700">{reasonList.find((x) => x.id === r.reasonId)?.label}</span><span className="font-medium text-riale-900">{r._count}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-riale-50"><div className="h-2 rounded-full bg-gold-500" style={{ width: `${(r._count / maxReason) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
