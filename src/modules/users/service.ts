import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { maskedFromEnc, protectCpf, revealCpf } from "@/lib/cpf";
import { hashPassword, passwordPolicyErrors } from "@/lib/password";
import { bool, cpf, email, name, optionalId } from "@/modules/shared/validation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { assertUnitInScope, unitScope } from "@/modules/shared/scope";

export const userCreateInput = z.object({
  name: name(),
  email,
  cpf,
  role: z.enum(Role, { error: "Perfil inválido" }),
  unitId: optionalId,
  managerId: optionalId,
  password: z.string({ error: "Senha inicial é obrigatória" }),
});

export const userUpdateInput = z.object({
  name: name().optional(),
  email: email.optional(),
  role: z.enum(Role).optional(),
  unitId: optionalId,
  managerId: optionalId,
  active: bool.optional(),
});

/** Regras anti-escalonamento: RH só administra usuários de perfil GESTOR (e dentro do seu escopo). */
function assertCanAssignRole(actor: CurrentUser, role: Role) {
  if (actor.role === "ADMIN") return;
  if (actor.role === "RH" && role === "GESTOR") return;
  throw new ForbiddenError("Seu perfil não pode conceder o perfil " + role);
}

function strip<T extends { passwordHash: string; cpfHash: string; cpfEnc: string }>(u: T) {
  const { passwordHash: _p, cpfHash: _h, cpfEnc, ...rest } = u;
  void _p;
  void _h;
  return { ...rest, cpfMasked: maskedFromEnc(cpfEnc) };
}

export async function listUsers(actor: CurrentUser) {
  assertCan(actor, "users.view");
  const scope = unitScope(actor);
  const rows = await prisma.user.findMany({
    where: scope ? { OR: [{ unitId: scope }, { manager: { department: { unitId: scope } } }] } : {},
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { unit: { select: { id: true, name: true } }, manager: { select: { id: true, name: true } } },
  });
  return rows.map(strip);
}

async function validateLinks(actor: CurrentUser, role: Role, unitId?: string | null, managerId?: string | null) {
  if (unitId) assertUnitInScope(actor, unitId);
  const scope = unitScope(actor);
  if (scope && role === "RH") throw new ForbiddenError();
  if (role === "GESTOR") {
    if (!managerId) throw new ValidationError("Usuário gestor deve ser vinculado a um cadastro de gestor", { managerId: ["Obrigatório para perfil Gestor"] });
    const m = await prisma.manager.findUnique({ where: { id: managerId }, include: { department: true } });
    if (!m) throw new ValidationError("Gestor não encontrado", { managerId: ["Inválido"] });
    assertUnitInScope(actor, m.department.unitId);
    return m;
  }
  return null;
}

export async function createUser(actor: CurrentUser, raw: unknown) {
  assertCan(actor, "users.manage");
  const data = userCreateInput.parse(raw);
  assertCanAssignRole(actor, data.role);
  const policy = passwordPolicyErrors(data.password, data.role);
  if (policy.length) throw new ValidationError("Senha fora da política", { password: policy });

  // RH de unidade só cria dentro da própria unidade
  const scope = unitScope(actor);
  const unitId = data.role === "ADMIN" ? null : (scope ?? data.unitId ?? null);
  const manager = await validateLinks(actor, data.role, unitId, data.managerId);
  if (manager?.userId) throw new ValidationError("Este gestor já possui usuário", { managerId: ["Já vinculado"] });

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        ...protectCpf(data.cpf),
        role: data.role,
        unitId: data.role === "GESTOR" ? (manager?.department.unitId ?? null) : unitId,
        passwordHash: await hashPassword(data.password),
        mustChangePassword: true, // senha inicial definida por terceiro → troca obrigatória no 1º acesso
        createdById: actor.id,
      },
    });
    if (manager) await tx.manager.update({ where: { id: manager.id }, data: { userId: u.id } });
    return u;
  });
  await recordAudit({ entityType: "User", entityId: user.id, action: "CREATE", actorId: actor.id, actorRole: actor.role, newValue: strip(user) });
  return strip(user);
}

export async function updateUser(actor: CurrentUser, userId: string, raw: unknown) {
  assertCan(actor, "users.manage");
  const before = await prisma.user.findUnique({ where: { id: userId }, include: { manager: true } });
  if (!before) throw new NotFoundError("Usuário não encontrado");
  assertCanAssignRole(actor, before.role);
  const data = userUpdateInput.parse(raw);
  if (data.role) assertCanAssignRole(actor, data.role);
  if (before.unitId) assertUnitInScope(actor, before.unitId);
  if (userId === actor.id && (data.active === false || (data.role && data.role !== actor.role))) {
    throw new ValidationError("Você não pode desativar nem alterar o próprio perfil");
  }

  const role = data.role ?? before.role;
  if (data.role || data.managerId !== undefined) await validateLinks(actor, role, data.unitId ?? before.unitId, data.managerId ?? before.manager?.id);

  // Impede remover o último ADMIN ativo
  if (before.role === "ADMIN" && (data.active === false || (data.role && data.role !== "ADMIN"))) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (admins <= 1) throw new ValidationError("É necessário manter ao menos um administrador ativo");
  }

  const { managerId, ...rest } = data;
  const user = await prisma.$transaction(async (tx) => {
    if (managerId !== undefined && managerId !== before.manager?.id) {
      if (before.manager) await tx.manager.update({ where: { id: before.manager.id }, data: { userId: null } });
      if (managerId) await tx.manager.update({ where: { id: managerId }, data: { userId } });
    }
    return tx.user.update({ where: { id: userId }, data: { ...rest, ...(role === "ADMIN" ? { unitId: null } : {}) } });
  });
  const { manager: _m, ...prev } = before;
  void _m;
  await recordAudit({ entityType: "User", entityId: user.id, action: data.active !== undefined && data.active !== before.active ? "STATUS_CHANGE" : "UPDATE", actorId: actor.id, actorRole: actor.role, previousValue: strip(prev), newValue: strip(user) });
  return strip(user);
}

/** Redefinição administrativa: define senha temporária e força troca no próximo acesso. */
export async function adminResetPassword(actor: CurrentUser, userId: string, tempPassword: string) {
  assertCan(actor, "users.manage");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError("Usuário não encontrado");
  assertCanAssignRole(actor, target.role);
  if (target.unitId) assertUnitInScope(actor, target.unitId);
  const policy = passwordPolicyErrors(tempPassword, target.role);
  if (policy.length) throw new ValidationError("Senha fora da política", { password: policy });
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  await recordAudit({ entityType: "User", entityId: userId, action: "PASSWORD_RESET", actorId: actor.id, actorRole: actor.role, newValue: { by: "admin" } });
}

export async function revealUserCpf(actor: CurrentUser, userId: string) {
  assertCan(actor, "pii.reveal");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError();
  if (u.unitId) assertUnitInScope(actor, u.unitId);
  await recordAudit({ entityType: "User", entityId: u.id, action: "PII_ACCESS", actorId: actor.id, actorRole: actor.role, newValue: { field: "cpf" } });
  return revealCpf(u.cpfEnc);
}
