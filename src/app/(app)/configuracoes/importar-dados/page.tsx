import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/datetime";
import { listImports, previewStored } from "@/modules/dataimport/service";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { brl } from "@/components/rem-tabs";
import { applyDataAction, uploadDataAction } from "./actions";

export const metadata = { title: "Importar dados da empresa" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { SALARIO_PAGO: "Salário pago", ADIC_NOTURNO: "Adicional noturno", DSR: "DSR", HORA_EXTRA: "Horas extras", INSALUBRIDADE: "Insalubridade", PERICULOSIDADE: "Periculosidade", GRATIFICACAO: "Gratificação", FERIADO: "Feriado", SALARIO_SUBSTITUICAO: "Salário substituição", TAXA_SERVICO: "Taxa de serviço", ELOGIO_PAGO_FOLHA: "Elogio Premiado (pago)", PREMIO: "Prêmio", IGNORAR: "Não recorrente — não importado" };
const STAT_LABEL: Record<string, string> = { positionsCreated: "cargos criados", positionsUpdated: "cargos atualizados", descriptors: "descritivos publicados", descriptorsKept: "descritivos manuais preservados", floors: "pisos salariais", departmentsCreated: "departamentos criados", employeesCreated: "colaboradores criados", employeesUpdated: "colaboradores atualizados", terminated: "desligamentos", payItems: "lançamentos", enrollments: "adesões a benefícios", rates: "alíquotas", skipped: "linhas com problema (ignoradas)" };

export default async function ImportDataPage({ searchParams }: { searchParams: Promise<{ arquivo?: string; aplicada?: string }> }) {
  const user = await requirePermission("dados.importar");
  const sp = await searchParams;
  const [preview, history] = await Promise.all([sp.arquivo ? previewStored(user, sp.arquivo).catch(() => null) : Promise.resolve(null), listImports(user)]);
  const applied = sp.aplicada ? await prisma.dataImport.findUnique({ where: { id: sp.aplicada } }) : null;
  const p = preview?.preview;

  return (
    <>
      <PageHeader title="Importar dados da empresa" subtitle="Carga da planilha padronizada: cargos e descritivos (relatório institucional), pisos, quadro de colaboradores com salário, lançamentos da folha, benefícios, encargos e clínica." breadcrumb={{ href: "/configuracoes", label: "Configurações" }} />
      <p className="mb-6 rounded-lg bg-gold-100/40 px-4 py-2 text-sm text-stone-700">A planilha contém dados pessoais e salariais (LGPD): fica cifrada, acessível só a administradores, e cada carga é auditada. Nada é gravado antes da confirmação. Reimportar a mesma competência não duplica — atualiza.</p>

      {applied && (
        <Card title="Carga aplicada" className="mb-6">
          <ul className="grid gap-1 text-sm sm:grid-cols-3">{Object.entries(applied.summary as Record<string, number>).map(([k, v]) => <li key={k}><span className="font-semibold tabular-nums text-riale-900">{v}</span> {STAT_LABEL[k] ?? k}</li>)}</ul>
        </Card>
      )}

      {!p && (
        <Card title="1. Enviar a planilha de carga" className="mb-6 max-w-2xl">
          <ActionForm action={uploadDataAction} className="flex flex-wrap items-center gap-3">
            <input type="file" name="file" accept=".xlsx" className="text-sm" aria-label="Planilha de carga" />
            <Submit pendingText="Analisando…">Analisar</Submit>
          </ActionForm>
          <p className="mt-3 text-xs text-stone-500">Abas: Parâmetros, Cargos, Colaboradores, Rubricas, Encargos e Clínica (modelo descrito em docs/CARGA-DADOS.md).</p>
        </Card>
      )}

      {p && preview && (
        <div className="space-y-6">
          <Card title={`2. Prévia — ${preview.fileName} · competência ${p.competence}`}>
            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Cargos (relatório institucional)</p><p><strong>{p.positions.total}</strong> cargos · {p.positions.existing} já no catálogo · <strong>{p.positions.newPositions.length}</strong> novos (nível a definir) · {p.positions.floors} pisos salariais</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Colaboradores (folha)</p><p><strong>{p.people.ok}</strong> de {p.people.total} válidos · {p.people.new} novos · {p.people.terminated} desligados no mês · {p.people.onLeave} afastados · {p.people.apprentices} aprendizes</p><p className="text-xs text-stone-500">{Object.entries(p.people.byUnit).map(([u, n]) => `${u}: ${n}`).join(" · ")}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Benefícios indicados pelos descontos</p><p>{p.benefits.map((b) => `${b.code}: ${b.people}`).join(" · ") || "—"}</p><p className="text-xs text-stone-500">Adesão sem custo para a empresa (não consta da folha)</p></div>
            </div>
            {p.people.problems.length > 0 && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p className="font-medium">{p.people.problems.length} linha(s) serão ignoradas:</p><ul className="text-xs">{p.people.problems.slice(0, 20).map((x) => <li key={x.line}>linha {x.line} — {x.name}: {x.problems.join("; ")}</li>)}</ul></div>
            )}
            {p.people.positionsFromPayroll.length > 0 && <p className="mt-3 text-xs text-gold-600">Cargos da folha sem correspondência no relatório (serão criados para revisão): {p.people.positionsFromPayroll.join(", ")}</p>}
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-riale-900">Centros de custo → departamentos</summary><ul className="mt-1 text-xs text-stone-600">{p.people.departments.map((d) => <li key={d}>{d}</li>)}</ul></details>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-riale-900">Rubricas de proventos → remuneração ({p.rubrics.length})</summary>
              <table className="mt-2 w-full text-xs"><tbody className="divide-y divide-stone-100">{p.rubrics.map((r) => <tr key={r.desc}><td className="py-1">{r.desc}</td><td>{r.type === "IGNORAR" ? <Badge>{TYPE_LABEL.IGNORAR}</Badge> : <Badge tone="green">{TYPE_LABEL[r.type] ?? r.type}</Badge>}</td><td className="text-right tabular-nums">{r.count}</td><td className="text-right tabular-nums">{brl(r.total)}</td></tr>)}</tbody></table>
            </details>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-riale-900">Alíquotas apuradas da folha</summary>
              <ul className="mt-1 text-xs text-stone-600">{p.rates.map((r) => <li key={r.unit}>{r.unit}: INSS empresa {r.INSS_PATRONAL}% · RAT×FAP {r.RAT_FAP}% · Terceiros {r.TERCEIROS}% · FGTS {r.FGTS}%{r.FGTS_APRENDIZ !== null ? ` · FGTS aprendiz ${r.FGTS_APRENDIZ}%` : ""}</li>)}</ul>
            </details>
            {p.clinic && <p className="mt-2 text-xs text-stone-500">Clínica ocupacional: {String(p.clinic)}</p>}
          </Card>
          <Card title="3. Confirmar">
            <ActionForm action={applyDataAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="documentId" value={preview.documentId} />
              <Submit pendingText="Gravando…">Aplicar carga</Submit>
              <a href="/configuracoes/importar-dados" className="text-sm text-stone-500 hover:underline">cancelar</a>
            </ActionForm>
            <p className="mt-2 text-xs text-stone-500">Descritivos cadastrados manualmente são preservados; cargos novos entram com “nível a definir”; desligamentos usam a data informada na planilha.</p>
          </Card>
        </div>
      )}

      <Card title="Cargas anteriores" className="mt-6">
        {history.length === 0 ? <p className="text-sm text-stone-400">Nenhuma.</p> : <ul className="divide-y divide-stone-100 text-sm">{history.map((h) => <li key={h.id} className="flex justify-between py-1.5"><span>{h.fileName} · competência {h.competence}</span><span className="text-xs text-stone-500">{fmtDateTime(h.createdAt)}</span></li>)}</ul>}
      </Card>
    </>
  );
}
