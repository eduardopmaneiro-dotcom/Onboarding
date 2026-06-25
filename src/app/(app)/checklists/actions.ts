"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

export async function completeChecklistItem(itemId: string) {
  const session = await auth();
  if (!session?.user.employeeId) throw new Error("Usuário sem colaborador vinculado.");

  const item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: itemId } });

  const updated = await prisma.checklistItem.update({
    where: { id: itemId },
    data: { status: "CONCLUIDO", completedDate: new Date(), completedById: session.user.employeeId },
  });

  await recordAudit({
    entityType: "ChecklistItem",
    entityId: itemId,
    action: "STATUS_CHANGE",
    actorId: session.user.id,
    actorRole: session.user.role,
    impactedEmployeeId: item.employeeId,
    previousValue: { status: item.status },
    newValue: { status: "CONCLUIDO" },
  });

  revalidatePath("/checklists");
  return updated;
}

export async function validateChecklistItem(itemId: string) {
  const session = await auth();
  if (!session || !can(session.user.role, "validateChecklist")) {
    throw new Error("Sem permissão para validar este item.");
  }

  const item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: itemId } });

  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { validatedById: session.user.employeeId },
  });

  await recordAudit({
    entityType: "ChecklistItem",
    entityId: itemId,
    action: "APPROVE",
    actorId: session.user.id,
    actorRole: session.user.role,
    impactedEmployeeId: item.employeeId,
  });

  revalidatePath("/checklists");
}
