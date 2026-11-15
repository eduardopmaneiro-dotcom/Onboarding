import Link from "next/link";
import { can, requirePermission } from "@/lib/session";
import { addDays, dateKey, fmtDate, localToDate, MONTHS, startOfMonth, startOfWeek, timeKey, todayKey, WEEKDAYS } from "@/lib/datetime";
import { formatPhone } from "@/lib/text";
import { listInterviews, listInterviewers, listReasons } from "@/modules/recruitment/workflow";
import { listUnits } from "@/modules/org/service";
import { RESULT_LABEL, RESULT_TONE } from "@/modules/recruitment/constants";
import { ResultPanel } from "@/components/recruitment/result-panel";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { resultAction } from "../recrutamento/actions";

export const metadata = { title: "Entrevistas" };

type View = "dia" | "semana" | "mes";
const DOT: Record<string, string> = { PENDENTE: "bg-gold-500", APROVADO: "bg-emerald-600", REPROVADO: "bg-red-600", NAO_COMPARECEU: "bg-stone-400", DESISTIU: "bg-stone-400" };

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ visao?: View; data?: string; unidade?: string; entrevistador?: string; agendadas?: string; aviso?: string }> }) {
  const user = await requirePermission("entrevistas.view");
  const sp = await searchParams;
  const view: View = sp.visao === "dia" || sp.visao === "mes" ? sp.visao : "semana";
  const day = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : todayKey();
  const today = todayKey();

  let from: string, to: string;
  if (view === "dia") { from = day; to = addDays(day, 1); }
  else if (view === "semana") { from = startOfWeek(day); to = addDays(from, 7); }
  else { from = startOfWeek(startOfMonth(day)); to = addDays(from, 42); }

  const [items, units, interviewers, reasons] = await Promise.all([
    listInterviews(user, localToDate(from), localToDate(to), { unitId: sp.unidade, interviewerUserId: sp.entrevistador }),
    listUnits(user),
    listInterviewers(),
    view === "dia" ? listReasons() : Promise.resolve([]),
  ]);
  const byDay = new Map<string, typeof items>();
  for (const i of items) { const k = dateKey(i.scheduledAt); byDay.set(k, [...(byDay.get(k) ?? []), i]); }

  const step = view === "dia" ? 1 : view === "semana" ? 7 : 0;
  const prev = view === "mes" ? addDays(startOfMonth(day), -1).slice(0, 8) + "01" : addDays(day, -step);
  const next = view === "mes" ? addDays(startOfMonth(day), 32).slice(0, 8) + "01" : addDays(day, step);
  const qs = (p: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ visao: view, data: day, unidade: sp.unidade, entrevistador: sp.entrevistador, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const title = view === "dia" ? fmtDate(localToDate(day, "12:00"), { weekday: "long", day: "2-digit", month: "long" }) : view === "semana" ? `Semana de ${fmtDate(localToDate(from, "12:00"), { day: "2-digit", month: "short" })} a ${fmtDate(localToDate(addDays(from, 6), "12:00"), { day: "2-digit", month: "short" })}` : `${MONTHS[Number(day.slice(5, 7)) - 1]} de ${day.slice(0, 4)}`;
  const resultPerm = can(user, "entrevistas.resultado");

  const chip = (i: (typeof items)[number]) => (
    <Link key={i.id} href={`/entrevistas/${i.id}`} className="block rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] leading-tight hover:border-gold-400">
      <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[i.result]}`} /><span className="font-mono text-stone-500">{i.hasTime ? timeKey(i.scheduledAt) : "—"}</span></span>
      <span className="block truncate font-medium text-riale-900">{i.application.candidate.fullName}</span>
      <span className="block truncate text-stone-400">{i.application.jobOpening.position.title}</span>
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Entrevistas"
        subtitle="Clique em uma entrevista para registrar o resultado. Na visão diária, o registro é feito direto na lista."
        actions={can(user, "recrutamento.manage") && (
          <>
            {can(user, "comunicacoes.manage") && <Link href={`/comunicacoes?data=${day}`} className="btn-ghost">Encerrar o dia / e-mails</Link>}
            <Link href={`/entrevistas/agendar?data=${day}`} className="btn-gold">+ Agendar</Link>
          </>
        )}
      />
      {sp.agendadas && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {sp.agendadas} entrevista(s) agendada(s).{" "}
          {sp.aviso === "revisar" ? <>O aviso ao gestor aguarda sua revisão em <Link href="/comunicacoes" className="underline">Comunicação com gestores</Link>.</>
            : sp.aviso ? <>O gestor receberá um aviso consolidado às {sp.aviso} — <Link href="/comunicacoes" className="underline">revisar ou enviar agora</Link>.</>
            : "Datas passadas não geram aviso ao gestor."}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-stone-300 bg-white text-sm">
          {(["dia", "semana", "mes"] as View[]).map((v) => (
            <Link key={v} href={qs({ visao: v })} className={`px-3 py-1.5 ${view === v ? "bg-riale-800 text-white" : "text-stone-600 hover:bg-riale-50"}`}>{v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}</Link>
          ))}
        </div>
        <Link href={qs({ data: prev })} className="btn-ghost btn-sm" aria-label="Anterior">‹</Link>
        <Link href={qs({ data: today })} className="btn-ghost btn-sm">Hoje</Link>
        <Link href={qs({ data: next })} className="btn-ghost btn-sm" aria-label="Próximo">›</Link>
        <h2 className="ml-2 font-serif text-xl text-riale-900 first-letter:uppercase">{title}</h2>
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="visao" value={view} /><input type="hidden" name="data" value={day} />
          {units.length > 1 && <select name="unidade" defaultValue={sp.unidade ?? ""} className="input py-1.5 text-xs"><option value="">Todas as unidades</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          <select name="entrevistador" defaultValue={sp.entrevistador ?? ""} className="input py-1.5 text-xs"><option value="">Todos os entrevistadores</option>{interviewers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <button className="btn-ghost btn-sm">Filtrar</button>
        </form>
      </div>

      {view === "dia" && (
        <Card>
          {items.length === 0 ? <Empty>Nenhuma entrevista neste dia.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {items.map((i) => (
                <li key={i.id} className="grid gap-4 py-4 first:pt-0 lg:grid-cols-[110px_minmax(0,1fr)_minmax(0,420px)]">
                  <div><p className="font-mono text-lg text-riale-900">{i.hasTime ? timeKey(i.scheduledAt) : "—"}</p><p className="text-xs text-stone-400">{i.durationMin} min</p></div>
                  <div>
                    <Link href={`/candidatos/${i.application.candidate.id}`} className="font-medium text-riale-900 hover:underline">{i.application.candidate.fullName}</Link>
                    <span className="ml-2 text-xs text-stone-400">{formatPhone(i.application.candidate.phone)}</span>
                    <p className="text-sm text-stone-600">{i.application.jobOpening.position.title} · {i.application.jobOpening.department.unit.name} › {i.application.jobOpening.department.name}</p>
                    <p className="text-xs text-stone-400">{i.stage}ª entrevista · entrevistador: {i.interviewerName ?? "—"} · gestor: {i.application.jobOpening.requestingManager?.name ?? "—"}{i.location ? ` · ${i.location}` : ""}</p>
                  </div>
                  <div>
                    {i.result === "PENDENTE" && resultPerm ? (
                      <ResultPanel action={resultAction} interviewId={i.id} reasons={reasons} benefits={[]} showSalary={false} compact />
                    ) : (
                      <div className="flex items-center gap-2"><Badge tone={RESULT_TONE[i.result]}>{RESULT_LABEL[i.result]}</Badge>{i.reason && <span className="text-xs text-stone-500">{i.reason.label}</span>}<Link href={`/entrevistas/${i.id}`} className="ml-auto text-xs text-gold-600 hover:underline">detalhes</Link></div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {view === "semana" && (
        <div className="grid gap-2 overflow-x-auto md:grid-cols-7">
          {Array.from({ length: 7 }, (_, d) => addDays(from, d)).map((k, d) => (
            <div key={k} className={`min-h-48 rounded-xl border p-2 ${k === today ? "border-gold-400 bg-gold-100/40" : "border-stone-200 bg-white"}`}>
              <Link href={qs({ visao: "dia", data: k })} className="mb-2 flex items-baseline justify-between text-xs hover:underline">
                <span className="font-semibold uppercase text-stone-500">{WEEKDAYS[d]}</span><span className="font-serif text-lg text-riale-900">{k.slice(8)}</span>
              </Link>
              <div className="space-y-1.5">{(byDay.get(k) ?? []).map(chip)}</div>
            </div>
          ))}
        </div>
      )}

      {view === "mes" && (
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => <p key={w} className="px-2 text-xs font-semibold uppercase text-stone-500">{w}</p>)}
            {Array.from({ length: 42 }, (_, d) => addDays(from, d)).map((k) => {
              const list = byDay.get(k) ?? [];
              const out = k.slice(0, 7) !== day.slice(0, 7);
              return (
                <Link key={k} href={qs({ visao: "dia", data: k })} className={`min-h-24 rounded-lg border p-1.5 text-xs transition hover:border-gold-400 ${k === today ? "border-gold-400 bg-gold-100/40" : "border-stone-200 bg-white"} ${out ? "opacity-40" : ""}`}>
                  <span className="font-semibold text-riale-900">{Number(k.slice(8))}</span>
                  {list.slice(0, 3).map((i) => (
                    <span key={i.id} className="mt-1 flex items-center gap-1 truncate"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[i.result]}`} />{i.hasTime ? timeKey(i.scheduledAt) : ""} {i.application.candidate.fullName.split(" ")[0]}</span>
                  ))}
                  {list.length > 3 && <span className="mt-1 block text-gold-600">+{list.length - 3}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
        {Object.entries(DOT).slice(0, 4).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{RESULT_LABEL[k as keyof typeof RESULT_LABEL]}</span>)}
      </p>
    </>
  );
}
