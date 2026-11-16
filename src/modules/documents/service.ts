import path from "node:path";
import type { DocumentClassification } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { decryptBuffer, encryptBuffer, randomToken, sha256 } from "@/lib/crypto";
import { assertCan, type CurrentUser } from "@/lib/session";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { getSetting } from "@/modules/settings/service";

/** Tipos aceitos — lista fechada (evita upload de executáveis/HTML). */
const ALLOWED_MIME: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
const OWNER_TYPES = ["Employee", "Candidate", "Manager", "JobOpening", "AdmissionDocument", "MedicalExam"] as const;
/** Documentos admissionais: acesso restrito (permissão própria + escopo da unidade do processo). */
const RESTRICTED: Record<string, (ownerId: string) => Promise<string | null>> = {
  AdmissionDocument: async (id) => (await prisma.admissionDocument.findUnique({ where: { id }, select: { admission: { select: { department: { select: { unitId: true } } } } } }))?.admission.department.unitId ?? null,
  MedicalExam: async (id) => (await prisma.medicalExam.findUnique({ where: { id }, select: { admission: { select: { department: { select: { unitId: true } } } } } }))?.admission.department.unitId ?? null,
};
async function assertRestrictedAccess(actor: CurrentUser, ownerType: string, ownerId: string) {
  const resolve = RESTRICTED[ownerType];
  if (!resolve) return;
  assertCan(actor, "admissoes.documentos");
  const unitId = await resolve(ownerId);
  if (!unitId) throw new NotFoundError("Documento não encontrado");
  if (actor.role !== "ADMIN" && actor.unitId && actor.unitId !== unitId) throw new NotFoundError("Documento não encontrado");
}

/** Assinaturas binárias ("magic numbers") — não confia no mime declarado pelo navegador. */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

export async function storeDocument(
  actor: CurrentUser,
  input: { ownerType: string; ownerId: string; category: string; file: File; classification?: DocumentClassification }
) {
  assertCan(actor, "documents.write");
  if (!OWNER_TYPES.includes(input.ownerType as (typeof OWNER_TYPES)[number])) throw new ValidationError("Tipo de proprietário inválido");
  await assertRestrictedAccess(actor, input.ownerType, input.ownerId);
  const maxMb = await getSetting("security.max_upload_mb");
  if (input.file.size === 0) throw new ValidationError("Arquivo vazio");
  if (input.file.size > maxMb * 1024 * 1024) throw new ValidationError(`Arquivo acima de ${maxMb} MB`);
  const buf = Buffer.from(await input.file.arrayBuffer());
  const mime = sniff(buf);
  const ext = path.extname(input.file.name).toLowerCase();
  if (!mime || !ALLOWED_MIME[mime]?.includes(ext)) throw new ValidationError("Formato não permitido (PDF, JPG, PNG ou DOCX)");

  const storageKey = `db:${randomToken(18)}`;
  const doc = await prisma.document.create({
    data: {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      category: input.category.slice(0, 60),
      originalName: path.basename(input.file.name).slice(0, 200),
      mimeType: mime,
      sizeBytes: buf.length,
      sha256: sha256(buf),
      storageKey,
      classification: input.classification ?? "CONFIDENCIAL",
      uploadedById: actor.id,
      blob: { create: { data: encryptBuffer(buf) } }, // cifrado antes de sair do servidor
    },
  });
  await recordAudit({ entityType: "Document", entityId: doc.id, action: "DOCUMENT_UPLOAD", actorId: actor.id, actorRole: actor.role, newValue: { ownerType: doc.ownerType, ownerId: doc.ownerId, category: doc.category, sha256: doc.sha256 } });
  return doc;
}

export async function readDocument(actor: CurrentUser, documentId: string) {
  assertCan(actor, "documents.read");
  const doc = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null }, include: { blob: true } });
  if (!doc?.blob) throw new NotFoundError("Documento não encontrado");
  try { await assertRestrictedAccess(actor, doc.ownerType, doc.ownerId); }
  catch (e) { await recordAudit({ entityType: "Document", entityId: doc.id, action: "ACCESS_DENIED", actorId: actor.id, actorRole: actor.role }); throw e; }
  const data = decryptBuffer(Buffer.from(doc.blob.data));
  if (sha256(data) !== doc.sha256) throw new Error("Falha de integridade do documento");
  await recordAudit({ entityType: "Document", entityId: doc.id, action: "DOCUMENT_DOWNLOAD", actorId: actor.id, actorRole: actor.role });
  const { blob: _b, ...meta } = doc;
  void _b;
  return { doc: meta, data };
}
