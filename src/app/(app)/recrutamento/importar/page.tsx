import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/datetime";
import { listBatches } from "@/modules/import/service";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { uploadImportAction } from "../actions";

export const metadata = { title: "Importar planilha" };

const STATUS: Record<string, { l: string; t: "gold" | "green" | "gray" | "blue" }> = {
  CARREGADO: { l: "Carregada", t: "gold" }, ANALISADO: { l: "Em revisão", t: "blue" }, IMPORTADO: { l: "Importada", t: "green" }, CANCELADO: { l: "Descartada", t: "gray" },
};

export default async function ImportPage() {
  const user = await requirePermission("importacao.executar");
  const batches = await listBatches(user);
  return (
    <>
      <PageHeader title="Importar planilha de recrutamento" subtitle="Traz o histórico de entrevistas, resultados, datas e motivos da planilha do RH. Nada é gravado antes da sua revisão." />
      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card title="1. Envie a planilha">
          <ActionForm action={uploadImportAction} className="space-y-4">
            <input type="file" name="file" accept=".xlsx,.csv" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-riale-800 file:px-4 file:py-2 file:text-sm file:text-white hover:file:bg-riale-700" />
            <p className="text-xs text-stone-500">Formatos: Excel (.xlsx) ou CSV. No Google Planilhas: <em>Arquivo › Fazer download › Microsoft Excel</em>.</p>
            <Submit className="btn-gold w-full" pendingText="Lendo a planilha…">Carregar e analisar</Submit>
          </ActionForm>
          <ol className="mt-6 space-y-2 border-t border-stone-100 pt-4 text-sm text-stone-600">
            <li><strong className="text-riale-900">Colunas:</strong> o sistema reconhece Unidade, Data, Candidato, Vaga, Recrutador, Resultado e Motivo.</li>
            <li><strong className="text-riale-900">Correspondências:</strong> cada grafia (ex.: “Ass. Governança”) é ligada ao cadastro certo — você confere.</li>
            <li><strong className="text-riale-900">Revisão:</strong> duplicidades e inconsistências aparecem antes de importar; nenhuma linha é descartada sem motivo.</li>
            <li><strong className="text-riale-900">Importação:</strong> cria candidatos, vagas históricas, entrevistas, resultados e o histórico de cada um.</li>
          </ol>
        </Card>
        <Card title="Importações anteriores">
          {batches.length === 0 ? <Empty>Nenhuma importação ainda.</Empty> : (
            <TableWrap>
              <table className="table">
                <thead><tr><th>Arquivo</th><th>Linhas</th><th>Resultado</th><th>Status</th></tr></thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td><Link href={`/recrutamento/importar/${b.id}`} className="font-medium text-riale-900 hover:underline">{b.fileName}</Link><p className="text-xs text-stone-400">{fmtDateTime(b.createdAt)} · {b.createdBy.name}</p></td>
                      <td>{b.totalRows}</td>
                      <td className="text-xs">{b.status === "IMPORTADO" ? `${b.importedRows} importadas · ${b.ignoredRows} ignoradas` : "—"}</td>
                      <td><Badge tone={STATUS[b.status].t}>{STATUS[b.status].l}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
