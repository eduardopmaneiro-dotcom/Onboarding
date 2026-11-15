import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { fmtDate, fmtDateTime, localToDate } from "@/lib/datetime";
import { normalizeText } from "@/lib/text";
import { getBatch, type ColumnMap, type ValueMap } from "@/modules/import/service";
import { FIELD_LABEL, OUTCOME_LABEL, type ImportField } from "@/modules/import/rules";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { cancelImportAction, columnMapAction, commitImportAction, rowDecisionAction, valueMapAction } from "../../actions";

export const metadata = { title: "Revisar importação" };

const ROW_STATUS: Record<string, { l: string; t: "green" | "gold" | "red" | "gray" | "blue" }> = {
  OK: { l: "Pronta", t: "green" }, ALERTA: { l: "Pronta c/ observação", t: "gold" }, DUPLICADO_ARQUIVO: { l: "Duplicada na planilha", t: "red" },
  JA_EXISTE: { l: "Já existe no sistema", t: "blue" }, INCONSISTENTE: { l: "Inconsistente", t: "red" }, IMPORTADO: { l: "Importada", t: "green" }, IGNORADO: { l: "Ignorada", t: "gray" },
};

type Norm = { name?: string; date?: string; time?: string; unitName?: string; positionTitle?: string; departmentName?: string; interviewerName?: string; outcomeLabel?: string; reasonCode?: string; resultText?: string; motivoText?: string; stage?: number };

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; etapa?: string }> }) {
  const user = await requirePermission("importacao.executar");
  const { id } = await params;
  const sp = await searchParams;
  const b = await getBatch(user, id);
  const cm = (b.columnMap ?? {}) as ColumnMap;
  const vm = (b.valueMap ?? { unidade: {}, vaga: {}, recrutador: {}, resultado: {}, motivo: {} }) as ValueMap;
  const [units, positions, users, reasons, deptNames] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.rejectionReason.findMany({ orderBy: { order: "asc" } }),
    prisma.department.findMany({ where: { active: true }, distinct: ["name"], select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const done = b.status === "IMPORTADO";
  const closed = done || b.status === "CANCELADO";
  const counts: Record<string, number> = {};
  for (const r of b.rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const toImport = b.rows.filter((r) => r.decision !== "IGNORAR" && r.status !== "INCONSISTENTE").length;
  const filter = sp.f;
  const rows = b.rows.filter((r) => (!filter ? true : filter === "problemas" ? ["DUPLICADO_ARQUIVO", "INCONSISTENTE", "JA_EXISTE", "ALERTA"].includes(r.status) : r.status === filter));
  const etapa = sp.etapa ?? (done ? "revisao" : "correspondencias");
  const aviso = (b.summary as { aviso?: string } | null)?.aviso;
  const tab = (k: string, l: string) => <Link href={`?etapa=${k}`} className={`chip ${etapa === k ? "chip-active" : ""}`}>{l}</Link>;

  return (
    <>
      <PageHeader title={b.fileName} subtitle={`${b.totalRows} linhas · aba “${b.sheetName}” · carregada em ${fmtDateTime(b.createdAt)}`} breadcrumb={{ href: "/recrutamento/importar", label: "Importar planilha" }}
        actions={<a href={`/api/v1/import/${b.id}/report`} className="btn-ghost">Baixar relatório (CSV)</a>} />
      {aviso && <p className="mb-4 rounded-lg bg-gold-100 px-4 py-2 text-sm text-gold-600">{aviso}</p>}
      {done && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Importação concluída em {fmtDateTime(b.committedAt)}: <strong>{b.importedRows}</strong> linha(s) importada(s), <strong>{b.ignoredRows}</strong> ignorada(s) — o motivo de cada uma está no relatório.</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        {Object.entries(ROW_STATUS).filter(([k]) => counts[k]).map(([k, v]) => (
          <Link key={k} href={`?etapa=revisao&f=${k}`} className="card p-3 hover:border-gold-400"><p className="text-xs text-stone-500">{v.l}</p><p className="font-serif text-2xl text-riale-900">{counts[k]}</p></Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tab("colunas", "1. Colunas")}{tab("correspondencias", "2. Correspondências")}{tab("revisao", "3. Revisão das linhas")}
      </div>

      {etapa === "colunas" && (
        <Card title="Qual informação está em cada coluna?">
          <ActionForm action={columnMapAction} className="space-y-4">
            <input type="hidden" name="batchId" value={b.id} />
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Coluna da planilha</th><th>Exemplo</th><th>Campo no sistema</th></tr></thead>
                <tbody>
                  {(b.headers as string[]).map((h) => (
                    <tr key={h}>
                      <td className="font-medium">{h}</td>
                      <td className="max-w-xs truncate text-xs text-stone-500">{String((b.rows.find((r) => (r.raw as Record<string, string>)[h])?.raw as Record<string, string> | undefined)?.[h] ?? "")}</td>
                      <td>
                        <select name={`col:${h}`} defaultValue={cm[h] ?? "ignorar"} disabled={closed} className="input py-1.5">
                          {(Object.keys(FIELD_LABEL) as ImportField[]).map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!closed && <Submit>Salvar colunas e reanalisar</Submit>}
          </ActionForm>
        </Card>
      )}

      {etapa === "correspondencias" && (
        <ActionForm action={valueMapAction} className="space-y-6">
          <input type="hidden" name="batchId" value={b.id} />
          <input type="hidden" name="current" value={JSON.stringify(vm)} />
          <Card title={`Unidades (${Object.keys(vm.unidade).length})`}>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(vm.unidade).map(([k, v]) => (
                <label key={k} className="text-sm"><span className="label">“{k}”</span>
                  <select name={`unidade::${k}`} defaultValue={v} disabled={closed} className={`input ${!v ? "border-red-400" : ""}`}><option value="">— não identificada —</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                </label>
              ))}
            </div>
          </Card>
          <Card title={`Vagas → cargos do catálogo (${Object.keys(vm.vaga).length} grafias)`}>
            <p className="mb-3 text-xs text-stone-500">Grafias diferentes do mesmo cargo são unificadas. As escolhas ficam salvas no cargo e são reaproveitadas nas próximas importações.</p>
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Na planilha</th><th>Cargo no sistema</th><th>Departamento</th></tr></thead>
                <tbody>
                  {Object.entries(vm.vaga).sort(([, a], [, c]) => Number(c.positionId === "NEW") - Number(a.positionId === "NEW")).map(([k, v]) => (
                    <tr key={k}>
                      <td className="font-medium">“{k}”</td>
                      <td>
                        <select name={`vaga::${k}::pos`} defaultValue={v.positionId} disabled={closed} className={`input py-1.5 ${v.positionId === "NEW" ? "border-gold-400" : ""}`}>
                          <option value="NEW">+ Criar cargo novo…</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        {v.positionId === "NEW" && <input name={`vaga::${k}::title`} defaultValue={v.newTitle} disabled={closed} className="input mt-1 py-1.5" placeholder="Nome do novo cargo" />}
                      </td>
                      <td>
                        <select name={`vaga::${k}::dept`} defaultValue={v.departmentName} disabled={closed} className={`input py-1.5 ${!v.departmentName ? "border-red-400" : ""}`}><option value="">—</option>{deptNames.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={`Resultados (${Object.keys(vm.resultado).length} formas de escrever)`}>
            <p className="mb-3 text-xs text-stone-500">A coluna de resultado mistura decisão do RH, avaliação externa (AGINCO), desistência, decisão do gestor e próximos passos. Confira a interpretação; o texto original fica guardado na observação.</p>
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Na planilha</th><th className="text-center">Linhas</th><th>Interpretação</th></tr></thead>
                <tbody>
                  {Object.entries(vm.resultado).map(([k, v]) => (
                    <tr key={k || "vazio"}>
                      <td className="font-medium">{k ? `“${k}”` : <em className="text-stone-400">(em branco)</em>}</td>
                      <td className="text-center text-xs">{b.rows.filter((r) => normalizeText((r.normalized as Norm | null)?.resultText) === k).length}</td>
                      <td><select name={`resultado::${k}`} defaultValue={v} disabled={closed} className="input py-1.5">{Object.entries(OUTCOME_LABEL).map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={`Motivos (${Object.keys(vm.motivo).length} textos)`}>
            <p className="mb-3 text-xs text-stone-500">Só é usado quando o desfecho é negativo (reprovação ou desistência). “Apenas observação” mantém o texto sem classificar.</p>
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="table">
                <thead><tr><th>Na planilha</th><th>Motivo padronizado</th></tr></thead>
                <tbody>
                  {Object.entries(vm.motivo).map(([k, v]) => (
                    <tr key={k}>
                      <td className="max-w-md text-sm">“{k}”</td>
                      <td><select name={`motivo::${k}`} defaultValue={v} disabled={closed} className="input py-1.5"><option value="">— apenas observação —</option>{reasons.map((r) => <option key={r.id} value={r.code}>{r.label}</option>)}</select></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={`Recrutadores (${Object.keys(vm.recrutador).length})`}>
            <p className="mb-3 text-xs text-stone-500">Ligue ao usuário do sistema quando existir; caso contrário, o nome é preservado como texto.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(vm.recrutador).map(([k, v]) => (
                <label key={k} className="text-sm"><span className="label">“{k}”</span>
                  <select name={`recrutador::${k}`} defaultValue={v} disabled={closed} className="input"><option value="">— manter apenas o nome —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                </label>
              ))}
            </div>
          </Card>
          {!closed && <div className="sticky bottom-4 z-10"><Submit className="btn-primary shadow-lg">Salvar correspondências e reanalisar</Submit></div>}
        </ActionForm>
      )}

      {etapa === "revisao" && (
        <Card
          title="Linhas da planilha"
          actions={
            <div className="flex flex-wrap gap-1 text-xs">
              <Link href="?etapa=revisao" className={`chip ${!filter ? "chip-active" : ""}`}>Todas ({b.rows.length})</Link>
              <Link href="?etapa=revisao&f=problemas" className={`chip ${filter === "problemas" ? "chip-active" : ""}`}>Com observações</Link>
            </div>
          }
        >
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Linha</th><th>Candidato</th><th>Entrevista</th><th>Desfecho</th><th>Situação</th><th>Decisão</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const n = (r.normalized ?? {}) as Norm;
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{r.rowNumber}</td>
                      <td><p className="font-medium text-riale-900">{n.name || <em className="text-red-600">sem nome</em>}{n.stage ? <span className="ml-1 text-xs text-stone-400">({n.stage}ª etapa)</span> : null}</p><p className="text-xs text-stone-400">{n.positionTitle} · {n.unitName ?? "?"}</p></td>
                      <td className="text-xs">{n.date ? fmtDate(localToDate(n.date, "12:00")) : "—"}<p className="text-stone-400">{n.interviewerName ?? ""}</p></td>
                      <td className="max-w-xs text-xs">{n.outcomeLabel}{n.reasonCode && <p className="text-red-700">{reasons.find((x) => x.code === n.reasonCode)?.label}</p>}<p className="text-stone-400">“{n.resultText}”{n.motivoText ? ` / “${n.motivoText}”` : ""}</p></td>
                      <td className="max-w-xs"><Badge tone={ROW_STATUS[r.status].t}>{ROW_STATUS[r.status].l}</Badge>{r.issues.map((i) => <p key={i} className="mt-1 text-[11px] text-stone-500">• {i}</p>)}</td>
                      <td className="text-xs">
                        {closed || r.status === "INCONSISTENTE" ? (
                          <>{r.decision === "IGNORAR" ? "Ignorar" : r.decision === "VINCULAR" ? "Vincular ao existente" : "Importar"}{r.ignoreReason && <p className="text-stone-400">{r.ignoreReason}</p>}</>
                        ) : (
                          <ActionForm action={rowDecisionAction} className="space-y-1">
                            <input type="hidden" name="batchId" value={b.id} /><input type="hidden" name="rowId" value={r.id} />
                            <select name="decision" defaultValue={r.decision ?? "IMPORTAR"} className="input py-1 text-xs">
                              <option value="IMPORTAR">Importar</option>{r.status === "JA_EXISTE" && <option value="VINCULAR">Vincular ao existente</option>}<option value="IGNORAR">Ignorar</option>
                            </select>
                            <input name="reason" placeholder="Motivo, se ignorar" defaultValue={r.ignoreReason ?? ""} className="input py-1 text-xs" />
                            <Submit className="btn-ghost btn-sm" pendingText="…">Salvar</Submit>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!closed && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-gold-400 bg-gold-100/50 p-4">
          <p className="flex-1 text-sm text-riale-900"><strong>{toImport}</strong> de {b.totalRows} linha(s) serão importadas. As demais ficam registradas no relatório com o motivo.</p>
          <ActionForm action={cancelImportAction}><input type="hidden" name="batchId" value={b.id} /><Submit className="btn-ghost">Descartar</Submit></ActionForm>
          <ActionForm action={commitImportAction}><input type="hidden" name="batchId" value={b.id} /><Submit className="btn-gold" pendingText="Importando…">Importar {toImport} linha(s)</Submit></ActionForm>
        </div>
      )}
    </>
  );
}
