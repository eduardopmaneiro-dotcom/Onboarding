import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assertCan, type CurrentUser } from "@/lib/session";
import { ADMIN_LOCKED, PERMISSION_CATALOG, type PermissionCode } from "@/lib/permissions";
import { ValidationError } from "@/modules/shared/errors";

export async function permissionMatrix() {
  const perms = await prisma.permission.findMany({ include: { roles: true }, orderBy: [{ module: "asc" }, { code: "asc" }] });
  return perms.map((p) => ({ ...p, granted: new Set(p.roles.map((r) => r.role)) }));
}

export async function setPermission(actor: CurrentUser, role: Role, code: PermissionCode, granted: boolean) {
  assertCan(actor, "permissions.manage");
  if (!(code in PERMISSION_CATALOG)) throw new ValidationError("Permissão desconhecida");
  if (role === "ADMIN" && !granted && ADMIN_LOCKED.includes(code)) {
    throw new ValidationError("Esta permissão é obrigatória para o Administrador");
  }
  const perm = await prisma.permission.findUniqueOrThrow({ where: { code } });
  if (granted) {
    await prisma.rolePermission.upsert({ where: { role_permissionId: { role, permissionId: perm.id } }, update: {}, create: { role, permissionId: perm.id } });
  } else {
    await prisma.rolePermission.deleteMany({ where: { role, permissionId: perm.id } });
  }
  await recordAudit({ entityType: "Permission", entityId: code, action: "PERMISSION_CHANGE", actorId: actor.id, actorRole: actor.role, newValue: { role, code, granted } });
}

/** Sincroniza o catálogo do código com o banco (usado no seed e no deploy). Não remove concessões customizadas. */
export async function syncPermissionCatalog(opts: { applyDefaults: boolean }) {
  for (const [code, def] of Object.entries(PERMISSION_CATALOG)) {
    const p = await prisma.permission.upsert({
      where: { code },
      update: { module: def.module, description: def.description },
      create: { code, module: def.module, description: def.description },
    });
    if (opts.applyDefaults) {
      for (const role of def.defaults) {
        await prisma.rolePermission.upsert({ where: { role_permissionId: { role, permissionId: p.id } }, update: {}, create: { role, permissionId: p.id } });
      }
    }
  }
}
