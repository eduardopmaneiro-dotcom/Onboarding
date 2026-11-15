import { apiRoute } from "@/modules/shared/api";
import { readDocument } from "@/modules/documents/service";

/** Download: decifra em memória, valida integridade (SHA-256) e registra auditoria. Nunca é cacheado. */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>("documents.read", async (u, _req, ctx) => {
  const { id } = await ctx.params;
  const { doc, data } = await readDocument(u, id);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
