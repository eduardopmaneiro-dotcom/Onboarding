import { z } from "zod";
import { CareerLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { id, name, optionalId, bool } from "@/modules/shared/validation";
import { NotFoundError, ForbiddenError } from "@/modules/shared/errors";
import { assertUnitInScope, isCorporate, unitScope } from "@/modules/shared/scope";

// ─────────── Unidades ───────────

export const unitInput = z.object({
  name: name("Nome da unidade"),
  code: z.string({ error: "Código é obrigatório" }).trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, "Código: 2–20 caracteres (A–Z, 0–9, _)"),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().toUpperCase().length(2, "UF com 2 letras").optional(),
  active: bool.optional(),
});

export async function listUnits(user: CurrentUser, opts: { includeInactive?: boolean } = {}) {
  const scope = unitScope(user);
  return prisma.unit.findMany({
    where: { ...(scope ? { id: scope } : {}), ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: { name: "asc" },
    include: { _count: { select: { departments: true, users: true } } },
  });
}

export async function createUnit(user: CurrentUser, raw: unknown) {
  assertCan(user, "org.manage");
  if (!isCorporate(user)) throw new ForbiddenError("Apenas ADMIN ou RH corporativo cadastram unidades");
  const data = unitInput.parse(raw);
  const unit = await prisma.unit.create({ data: { ...data, active: data.active ?? true } });
  await recordAudit({ entityType: "Unit", entityId: unit.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: unit });
  return unit;
}

export async function updateUnit(user: CurrentUser, unitId: string, raw: unknown) {
  assertCan(user, "org.manage");
  if (!isCorporate(user)) throw new ForbiddenError("Apenas ADMIN ou RH corporativo alteram unidades");
  const data = unitInput.partial().parse(raw);
  const before = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!before) throw new NotFoundError("Unidade não encontrada");
  const unit = await prisma.unit.update({ where: { id: unitId }, data });
  await recordAudit({ entityType: "Unit", entityId: unit.id, action: "UPDATE", actorId: user.id, actorRole: user.role, previousValue: before, newValue: unit });
  return unit;
}

// ─────────── Departamentos ───────────

export const departmentInput = z.object({
  name: name("Nome do departamento"),
  code: z.string().trim().toUpperCase().max(20).optional(),
  unitId: id,
  active: bool.optional(),
});

export async function listDepartments(user: CurrentUser, opts: { unitId?: string; includeInactive?: boolean } = {}) {
  const scope = unitScope(user);
  return prisma.department.findMany({
    where: {
      ...(scope ? { unitId: scope } : opts.unitId ? { unitId: opts.unitId } : {}),
      ...(opts.includeInactive ? {} : { active: true }),
    },
    orderBy: [{ unit: { name: "asc" } }, { name: "asc" }],
    include: { unit: { select: { id: true, name: true } }, _count: { select: { managers: true, employees: true } } },
  });
}

export async function createDepartment(user: CurrentUser, raw: unknown) {
  assertCan(user, "org.manage");
  const data = departmentInput.parse(raw);
  assertUnitInScope(user, data.unitId);
  const unit = await prisma.unit.findFirst({ where: { id: data.unitId, active: true } });
  if (!unit) throw new NotFoundError("Unidade inexistente ou inativa");
  const dept = await prisma.department.create({ data: { ...data, active: data.active ?? true } });
  await recordAudit({ entityType: "Department", entityId: dept.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: dept });
  return dept;
}

export async function updateDepartment(user: CurrentUser, deptId: string, raw: unknown) {
  assertCan(user, "org.manage");
  const before = await prisma.department.findUnique({ where: { id: deptId } });
  if (!before) throw new NotFoundError("Departamento não encontrado");
  assertUnitInScope(user, before.unitId);
  const data = departmentInput.partial().parse(raw);
  if (data.unitId) assertUnitInScope(user, data.unitId);
  const dept = await prisma.department.update({ where: { id: deptId }, data });
  await recordAudit({ entityType: "Department", entityId: dept.id, action: "UPDATE", actorId: user.id, actorRole: user.role, previousValue: before, newValue: dept });
  return dept;
}

// ─────────── Cargos (catálogo corporativo) ───────────

export const positionInput = z.object({
  title: name("Nome do cargo"),
  code: z.string().trim().toUpperCase().max(30).optional(),
  level: z.enum(CareerLevel, { error: "Nível inválido" }),
  careerTrackId: optionalId,
  description: z.string().trim().max(2000).optional(),
  isLeadership: bool.optional(),
  active: bool.optional(),
});

export async function listPositions(_user: CurrentUser, opts: { includeInactive?: boolean } = {}) {
  return prisma.position.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: [{ careerTrack: { name: "asc" } }, { level: "asc" }, { title: "asc" }],
    include: {
      careerTrack: { select: { id: true, name: true } },
      _count: { select: { managers: true, employees: true } },
    },
  });
}

export async function listCareerTracks() {
  return prisma.careerTrack.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { stages: { orderBy: { order: "asc" } }, _count: { select: { positions: true } } },
  });
}

/** O catálogo de cargos é corporativo: só ADMIN e RH corporativo alteram (garante padronização entre unidades). */
function assertCatalogEditor(user: CurrentUser) {
  assertCan(user, "org.manage");
  if (!isCorporate(user)) throw new ForbiddenError("O catálogo de cargos é corporativo — apenas ADMIN ou RH corporativo alteram");
}

export async function createPosition(user: CurrentUser, raw: unknown) {
  assertCatalogEditor(user);
  const data = positionInput.parse(raw);
  const pos = await prisma.position.create({ data: { ...data, careerTrackId: data.careerTrackId ?? null, active: data.active ?? true } });
  await recordAudit({ entityType: "Position", entityId: pos.id, action: "CREATE", actorId: user.id, actorRole: user.role, newValue: pos });
  return pos;
}

export async function updatePosition(user: CurrentUser, positionId: string, raw: unknown) {
  assertCatalogEditor(user);
  const before = await prisma.position.findUnique({ where: { id: positionId } });
  if (!before) throw new NotFoundError("Cargo não encontrado");
  const data = positionInput.partial().parse(raw);
  const pos = await prisma.position.update({ where: { id: positionId }, data });
  await recordAudit({ entityType: "Position", entityId: pos.id, action: "UPDATE", actorId: user.id, actorRole: user.role, previousValue: before, newValue: pos });
  return pos;
}
