import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, can, type CurrentUser } from "@/lib/session";
import { maskedFromEnc, protectCpf, revealCpf } from "@/lib/cpf";
import { bool, email, id, name, optionalCpf, optionalId } from "@/modules/shared/validation";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { assertUnitInScope, unitScope } from "@/modules/shared/scope";

const managerBase = z.object({
    name: name("Nome do gestor"),
    email,
    cpf: optionalCpf,
    internalId: z.string().trim().max(30).optional(),
    positionId: id,
    departmentId: id,
    directSuperiorId: optionalId,
  active: bool.optional(),
});

export const managerInput = managerBase.refine((v) => v.cpf || v.internalId, { message: "Informe CPF ou matrícula interna", path: ["cpf"] });

/** Representação pública: CPF sempre mascarado. */
export async function listManagers(user: CurrentUser, opts: { departmentId?: string; includeInactive?: boolean } = {}) {
  const scope = unitScope(user);
  const rows = await prisma.manager.findMany({
    where: {
      ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
      ...(scope ? { department: { unitId: scope } } : {}),
      ...(opts.includeInactive ? {} : { active: true }),
    },
    orderBy: [{ department: { unit: { name: "asc" } } }, { department: { name: "asc" } }, { name: "asc" }],
    include: {
      position: { select: { id: true, title: true } },
      department: { select: { id: true, name: true, unit: { select: { id: true, name: true } } } },
      directSuperior: { select: { id: true, name: true } },
      user: { select: { id: true, role: true, active: true } },
      _count: { select: { directReports: true } },
    },
  });
  return rows.map(({ cpfEnc, cpfHash: _h, ...m }) => {
    void _h;
    return { ...m, cpfMasked: maskedFromEnc(cpfEnc), hasCpf: !!cpfEnc };
  });
}

async function resolveDepartment(departmentId: string) {
  const d = await prisma.department.findFirst({ where: { id: departmentId, active: true } });
  if (!d) throw new ValidationError("Departamento inexistente ou inativo", { departmentId: ["Departamento inválido"] });
  return d;
}

async function assertNoCycle(managerId: string | null, superiorId: string | null | undefined) {
  if (!superiorId) return;
  if (managerId && superiorId === managerId) throw new ValidationError("O gestor não pode ser superior de si mesmo", { directSuperiorId: ["Inválido"] });
  let cursor: string | null = superiorId;
  for (let depth = 0; cursor && depth < 50; depth++) {
    const s: { id: string; directSuperiorId: string | null } | null = await prisma.manager.findUnique({ where: { id: cursor }, select: { id: true, directSuperiorId: true } });
    if (!s) throw new ValidationError("Superior direto não encontrado", { directSuperiorId: ["Inválido"] });
    if (managerId && s.directSuperiorId === managerId) throw new ValidationError("Hierarquia circular: o superior escolhido está abaixo deste gestor", { directSuperiorId: ["Hierarquia circular"] });
    cursor = s.directSuperiorId;
  }
}

export async function createManager(user: CurrentUser, raw: unknown) {
  assertCan(user, "managers.manage");
  const data = managerInput.parse(raw);
  const dept = await resolveDepartment(data.departmentId);
  assertUnitInScope(user, dept.unitId);
  const pos = await prisma.position.findFirst({ where: { id: data.positionId, active: true } });
  if (!pos) throw new ValidationError("Cargo inexistente ou inativo", { positionId: ["Cargo inválido"] });
  await assertNoCycle(null, data.directSuperiorId);

  const { cpf, ...rest } = data;
  const m = await prisma.manager.create({
    data: { ...rest, directSuperiorId: data.directSuperiorId ?? null, internalId: data.internalId ?? null, active: data.active ?? true, ...(cpf ? protectCpf(cpf) : {}) },
  });
  await recordAudit({ entityType: "Manager", entityId: m.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: m });
  return m;
}

export async function updateManager(user: CurrentUser, managerId: string, raw: unknown) {
  assertCan(user, "managers.manage");
  const before = await prisma.manager.findUnique({ where: { id: managerId }, include: { department: true } });
  if (!before) throw new NotFoundError("Gestor não encontrado");
  assertUnitInScope(user, before.department.unitId);

  const data = managerBase.partial().parse(raw);
  if (data.departmentId) assertUnitInScope(user, (await resolveDepartment(data.departmentId)).unitId);
  if (data.directSuperiorId !== undefined) await assertNoCycle(managerId, data.directSuperiorId);
  const hasId = data.cpf || data.internalId || before.cpfHash || before.internalId;
  if (!hasId) throw new ValidationError("Informe CPF ou matrícula interna", { cpf: ["Obrigatório"] });

  const { cpf, ...rest } = data;
  const { department: _d, ...prev } = before;
  void _d;
  const m = await prisma.manager.update({ where: { id: managerId }, data: { ...rest, ...(cpf ? protectCpf(cpf) : {}) } });
  await recordAudit({ entityType: "Manager", entityId: m.id, action: "UPDATE", actorId: user.id, actorRole: user.role, previousValue: prev, newValue: m });
  return m;
}

/** Revela CPF completo — exige permissão específica e sempre gera registro de auditoria (LGPD). */
export async function revealManagerCpf(user: CurrentUser, managerId: string, justification?: string) {
  assertCan(user, "pii.reveal");
  const m = await prisma.manager.findUnique({ where: { id: managerId }, include: { department: true } });
  if (!m || !m.cpfEnc) throw new NotFoundError("CPF não cadastrado");
  assertUnitInScope(user, m.department.unitId);
  await recordAudit({ entityType: "Manager", entityId: m.id, action: "PII_ACCESS", actorId: user.id, actorRole: user.role, newValue: { field: "cpf" }, justification });
  return revealCpf(m.cpfEnc);
}

export function canRevealPii(user: CurrentUser) {
  return can(user, "pii.reveal");
}
