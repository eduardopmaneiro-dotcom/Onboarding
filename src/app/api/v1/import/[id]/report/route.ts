import { apiRoute } from "@/modules/shared/api";
import { batchReportCsv } from "@/modules/import/service";

/** Relatório CSV linha a linha (o que foi importado, ignorado e por quê). */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>("importacao.executar", async (u, _req, ctx) => {
  const { id } = await ctx.params;
  const csv = await batchReportCsv(u, id);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-importacao-${id}.csv"`, "Cache-Control": "no-store" } });
});
