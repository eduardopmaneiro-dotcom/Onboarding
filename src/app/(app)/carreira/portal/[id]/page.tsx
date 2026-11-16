import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere } from "@/modules/people/scope";
import { portalView } from "@/modules/career/people";
import { ELIGIBILITY_LABEL } from "@/modules/career/rules";
import { EDUCATION_LABEL } from "@/modules/career/constants";
import { Badge, Card, PageHeader } from "@/components/ui";
import { brl } from "@/components/rem-tabs";

export const metadata = { title: "Portal do colaborador (prévia)" };
export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = { ADMISSAO: "Admissão", PROMOCAO: "Promoção", MUDANCA_CARGO: "Mudança de cargo", TRANSFERENCIA_DEPARTAMENTO: "Transferência", TRANSFERENCIA_UNIDADE: "Transferência de unidade", MUDANCA_GESTOR: "Novo gestor", ALTERACAO_SALARIAL: "Reajuste", DESLIGAMENTO: "Desligamento" };
const fmt = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

/** Prévia, para o RH, do que o colaborador verá no portal (login do colaborador ainda não habilitado). */
export default async function PortalPreview({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("carreira.view");
  const { id } = await params;
  await prisma.employee.findFirstOrThrow({ where: { id, ...employeeScopeWhere(user) }, select: { id: true } });
  const v = await portalView(id);
  const band = (b: { min?: number | null; ref: number; max?: number | null } | null) => (!b ? null : "min" in b ? `${brl(b.min ?? null)} a ${brl(b.max ?? null)} (referência ${brl(b.ref)})` : `referência ${brl(b.ref)}`);
  return (
    <>
      <PageHeader title={`Olá, ${v.employee.name.split(" ")[0]}`} subtitle="Prévia do Portal do Colaborador — é isto que o colaborador verá quando o acesso for liberado." breadcrumb={{ href: `/carreira/colaborador/${id}`, label: "Carreira do colaborador" }} />
      <p className="mb-6 rounded-lg bg-gold-100/40 px-4 py-2 text-sm text-stone-700">{v.disclaimer}</p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Meu cargo">
          <p className="font-serif text-2xl text-riale-900">{v.employee.position} <Badge tone="blue">{v.employee.level}</Badge></p>
          <p className="text-sm text-stone-500">{v.employee.department} · {v.employee.unit} · no cargo desde {fmt(v.employee.since)}</p>
          {v.currentBand && <p className="mt-2 text-sm">Faixa salarial do cargo: {band(v.currentBand)}</p>}
          {v.descriptor ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-stone-700">{v.descriptor.objective}</p>
              <p className="text-xs font-semibold uppercase text-stone-500">Responsabilidades</p>
              <ul className="list-disc pl-5">{v.descriptor.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : <p className="mt-3 text-sm text-stone-400">Descritivo do cargo ainda não publicado.</p>}
        </Card>
        <Card title="Minha trilha e próximos níveis">
          {v.next.length === 0 && <p className="text-sm text-stone-400">Ainda não há trilha publicada para o seu cargo.</p>}
          {v.next.map((n) => (
            <div key={n.path} className="mb-5">
              <p className="text-sm text-stone-600">{n.steps.map((s, i) => <span key={s.title}>{i > 0 && " → "}<span className={s.current ? "font-semibold text-riale-900 underline" : ""}>{s.title}</span></span>)}</p>
              <p className="mt-2 font-medium text-riale-900">Próximo nível: {n.position} ({n.level})</p>
              {n.band && <p className="text-xs text-stone-500">Faixa: {band(n.band)}</p>}
              <div className="mt-2 grid gap-2 md:grid-cols-2 text-xs">
                <div className="rounded-md bg-riale-50 p-2"><p className="font-semibold text-riale-900">Requisitos mínimos</p><ul className="list-disc pl-4">{[...n.mustHave.progression, ...n.mustHave.descriptor].map((r) => <li key={r}>{r}</li>)}{n.mustHave.education && <li>Escolaridade: {EDUCATION_LABEL[n.mustHave.education]}</li>}{n.mustHave.minExperienceMonths !== null && <li>Experiência: {n.mustHave.minExperienceMonths} meses</li>}{n.mustHave.minMonthsInRole !== null && <li>{n.mustHave.minMonthsInRole} meses no cargo atual</li>}<li>Avaliação de promoção ≥ {n.mustHave.minScore}</li></ul></div>
                <div className="rounded-md bg-gold-100/40 p-2"><p className="font-semibold text-gold-600">O que desenvolver (PDI)</p><ul className="list-disc pl-4">{n.develop.map((r) => <li key={r}>{r}</li>)}</ul>{!n.develop.length && <p className="text-stone-400">não informado</p>}</div>
              </div>
              <p className="mt-2 text-xs text-stone-500">Situação dos critérios objetivos: {ELIGIBILITY_LABEL[n.objectiveCriteria.status]}</p>
            </div>
          ))}
        </Card>
        <Card title="Meu PDI">
          {v.pdis.length === 0 ? <p className="text-sm text-stone-400">Nenhum item.</p> : <ul className="space-y-2 text-sm">{v.pdis.map((p) => <li key={p.id}><span className="font-medium">{p.gap}</span> — {p.goal} <Badge>{Math.round(p.completion)}%</Badge></li>)}</ul>}
        </Card>
        <Card title="Meu histórico profissional">
          <ul className="space-y-1 text-sm">{v.history.map((h, i) => <li key={i}>{fmt(h.date)} · {TYPE[h.type] ?? h.type}{h.position && h.type !== "ALTERACAO_SALARIAL" ? ` · ${h.position}` : ""}</li>)}</ul>
        </Card>
      </div>
      <p className="mt-4 text-xs text-stone-400">Política atual de exibição de faixa: {v.policy === "NAO_EXIBIR" ? "não exibir" : v.policy === "REFERENCIA" ? "só referência" : "faixa completa"} (Carreira › Política). Nenhum salário individual aparece no portal.</p>
    </>
  );
}
