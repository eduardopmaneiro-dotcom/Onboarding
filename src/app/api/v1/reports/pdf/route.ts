import { apiRoute } from "@/modules/shared/api";
import { recordAudit } from "@/lib/audit";
import { buildReport, type ReportQuery } from "@/modules/analytics/report";
import { reportToPdf } from "@/modules/analytics/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = apiRoute("relatorios.exportar", async (u, req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams) as ReportQuery;
  const r = await buildReport(u, q);
  const buf = await reportToPdf(r);
  await recordAudit({ entityType: "Relatorio", entityId: "indicadores.pdf", action: "EXPORT", actorId: u.id, actorRole: u.role, newValue: q });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="riale-indicadores-rh-${r.period.gran}-${r.period.from}.pdf"`, "Cache-Control": "no-store" },
  });
});
