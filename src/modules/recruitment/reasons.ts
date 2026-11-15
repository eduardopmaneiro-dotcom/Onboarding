import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { normalizeText } from "@/lib/text";
import { ValidationError } from "@/modules/shared/errors";

const input = z.object({
  label: z.string({ error: "Informe o motivo" }).trim().min(3, "Mínimo 3 caracteres").max(120),
  requiresNote: z.preprocess((v) => v === true || v === "true", z.boolean()).optional(),
  active: z.preprocess((v) => v === true || v === "true", z.boolean()).optional(),
});

/** Motivos são editáveis, mas o `code` é estável (os relatórios dependem dele). */
export async function saveReason(user: CurrentUser, raw: unknown, id?: string) {
  assertCan(user, "settings.manage");
  const data = input.parse(raw);
  if (id) {
    const before = await prisma.rejectionReason.findUniqueOrThrow({ where: { id } });
    const r = await prisma.rejectionReason.update({ where: { id }, data: { label: data.label, requiresNote: data.requiresNote ?? before.requiresNote, active: data.active ?? before.active } });
    await recordAudit({ entityType: "RejectionReason", entityId: id, action: "UPDATE", actorId: user.id, actorRole: user.role, previousValue: before, newValue: r });
    return r;
  }
  const code = normalizeText(data.label).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  if (await prisma.rejectionReason.findUnique({ where: { code } })) throw new ValidationError("Já existe um motivo com esse nome", { label: ["Duplicado"] });
  const order = (await prisma.rejectionReason.aggregate({ _max: { order: true } }))._max.order ?? 0;
  const r = await prisma.rejectionReason.create({ data: { code, label: data.label, requiresNote: !!data.requiresNote, order: order + 1 } });
  await recordAudit({ entityType: "RejectionReason", entityId: r.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: r });
  return r;
}
