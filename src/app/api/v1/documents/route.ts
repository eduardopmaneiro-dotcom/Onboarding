import { apiRoute } from "@/modules/shared/api";
import { storeDocument } from "@/modules/documents/service";
import { ValidationError } from "@/modules/shared/errors";

/** Upload protegido (multipart/form-data: file, ownerType, ownerId, category). */
export const POST = apiRoute("documents.write", async (u, req) => {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) throw new ValidationError("Arquivo ausente", { file: ["Obrigatório"] });
  const doc = await storeDocument(u, { ownerType: String(fd.get("ownerType")), ownerId: String(fd.get("ownerId")), category: String(fd.get("category") ?? "geral"), file });
  return { id: doc.id, originalName: doc.originalName, sizeBytes: doc.sizeBytes, sha256: doc.sha256 };
});
