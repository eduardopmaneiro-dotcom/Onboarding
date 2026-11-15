/**
 * Testes de integração da camada de serviço contra o PostgreSQL real (requer seed).
 * Cobrem: escopo por unidade, anti-escalonamento, hierarquia de gestores,
 * proteção do CPF, imutabilidade da auditoria e integridade relacional.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import type { CurrentUser } from "../../src/lib/session";
import type { PermissionCode } from "../../src/lib/permissions";
import { createDepartment, createUnit, listDepartments, createPosition } from "../../src/modules/org/service";
import { createManager, updateManager, listManagers, revealManagerCpf } from "../../src/modules/managers/service";
import { createUser, updateUser } from "../../src/modules/users/service";
import { setPermission } from "../../src/modules/permissions/service";
import { requestPasswordReset } from "../../src/modules/auth/service";
import { ForbiddenError, toPublicError } from "../../src/modules/shared/errors";

const RUN = Date.now().toString(36).toUpperCase();

/** CPF válido e único por execução (testes idempotentes). */
function randomCpf(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
const CPF_A = randomCpf();
const CPF_A_FMT = CPF_A.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

async function asUser(email: string): Promise<CurrentUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { manager: true } });
  const grants = await prisma.rolePermission.findMany({ where: { role: u.role }, include: { permission: true } });
  return { id: u.id, name: u.name, email: u.email, role: u.role, unitId: u.unitId, managerId: u.manager?.id ?? null, mustChangePassword: false, permissions: new Set(grants.map((g) => g.permission.code as PermissionCode)) };
}

const isForbidden = (e: unknown) => e instanceof ForbiddenError;

after(() => prisma.$disconnect());

test("Unidades do seed existem: Brisa Barra, Imperial e Vilamar", async () => {
  const names = (await prisma.unit.findMany({ orderBy: { name: "asc" } })).map((u) => u.name);
  for (const n of ["Brisa Barra", "Imperial", "Vilamar"]) assert.ok(names.includes(n));
});

test("Gestor (perfil) não pode cadastrar estrutura", async () => {
  const gestor = await asUser("marina.souza@rialehoteis.com.br");
  const unit = await prisma.unit.findUniqueOrThrow({ where: { code: "BRISA" } });
  await assert.rejects(createDepartment(gestor, { name: `Spa ${RUN}`, unitId: unit.id }), isForbidden);
  await assert.rejects(createUnit(gestor, { name: `X ${RUN}`, code: `X${RUN}` }), isForbidden);
});

test("RH de unidade: só enxerga e altera a própria unidade; não cria unidade nem cargo", async () => {
  const rh = await asUser("rh.brisabarra@rialehoteis.com.br");
  const imperial = await prisma.unit.findUniqueOrThrow({ where: { code: "IMPERIAL" } });
  const depts = await listDepartments(rh);
  assert.ok(depts.length > 0 && depts.every((d) => d.unit.name === "Brisa Barra"));
  await assert.rejects(createDepartment(rh, { name: `Spa ${RUN}`, unitId: imperial.id }), isForbidden);
  await assert.rejects(createUnit(rh, { name: `Nova ${RUN}`, code: `N${RUN}` }), isForbidden);
  await assert.rejects(createPosition(rh, { title: `Cargo ${RUN}`, level: "N1" }), isForbidden);
  const created = await createDepartment(rh, { name: `Spa ${RUN}`, unitId: rh.unitId });
  assert.equal(created.unitId, rh.unitId);
});

test("RH corporativo cadastra unidade e departamento; validação rejeita dados inválidos", async () => {
  const rh = await asUser("rh@rialehoteis.com.br");
  const unit = await createUnit(rh, { name: `Ipanema ${RUN}`, code: `IPA_${RUN}`.slice(0, 20), city: "Rio de Janeiro", state: "RJ" });
  const dept = await createDepartment(rh, { name: "Recepção", unitId: unit.id });
  assert.equal(dept.unitId, unit.id);
  const err = await createUnit(rh, { name: "A", code: "x y" }).catch((e) => e);
  assert.equal(toPublicError(err).status, 422);
  const dup = await createDepartment(rh, { name: "Recepção", unitId: unit.id }).catch((e) => e);
  assert.equal(toPublicError(dup).status, 409);
});

test("Gestores: vários por departamento, CPF protegido, matrícula como alternativa e hierarquia sem ciclos", async () => {
  const admin = await asUser("admin@rialehoteis.com.br");
  const dept = await prisma.department.findFirstOrThrow({ where: { code: "GOV", unit: { code: "VILAMAR" } } });
  const pos = await prisma.position.findUniqueOrThrow({ where: { title: "Governanta" } });

  const noId = await createManager(admin, { name: "Sem Id", email: `semid.${RUN}@x.com`, positionId: pos.id, departmentId: dept.id }).catch((e) => e);
  assert.equal(toPublicError(noId).status, 422);

  const a = await createManager(admin, { name: "Gestora A", email: `a.${RUN}@x.com`, cpf: CPF_A, positionId: pos.id, departmentId: dept.id });
  const b = await createManager(admin, { name: "Gestor B", email: `b.${RUN}@x.com`, internalId: `VL-${RUN}`, positionId: pos.id, departmentId: dept.id, directSuperiorId: a.id });
  assert.equal((await prisma.manager.count({ where: { departmentId: dept.id, id: { in: [a.id, b.id] } } })), 2);

  const raw = await prisma.manager.findUniqueOrThrow({ where: { id: a.id } });
  assert.ok(raw.cpfHash && raw.cpfEnc && !raw.cpfEnc.includes(CPF_A));
  const listed = (await listManagers(admin)).find((m) => m.id === a.id)!;
  assert.equal(listed.cpfMasked, `***.${CPF_A.slice(3, 6)}.${CPF_A.slice(6, 9)}-**`);
  assert.ok(!("cpfEnc" in listed));

  const cycle = await updateManager(admin, a.id, { directSuperiorId: b.id }).catch((e) => e);
  assert.equal(toPublicError(cycle).status, 422);

  assert.equal(await revealManagerCpf(admin, a.id), CPF_A_FMT);
  const pii = await prisma.auditLog.findFirst({ where: { entityId: a.id, action: "PII_ACCESS" } });
  assert.ok(pii, "acesso ao CPF deve ser auditado");

  const gestor = await asUser("marina.souza@rialehoteis.com.br");
  await assert.rejects(revealManagerCpf(gestor, a.id), isForbidden);
});

test("Usuários: RH não concede perfil RH/ADMIN; gestor exige vínculo; último admin é protegido", async () => {
  const rh = await asUser("rh@rialehoteis.com.br");
  const admin = await asUser("admin@rialehoteis.com.br");
  await assert.rejects(createUser(rh, { name: "Novo Admin", email: `adm.${RUN}@x.com`, cpf: "862.247.150-09", role: "ADMIN", password: "Riale@2026Seguro" }), isForbidden);

  const noLink = await createUser(rh, { name: "Gestor Solto", email: `g.${RUN}@x.com`, cpf: "862.247.150-09", role: "GESTOR", password: "Riale2026ok" }).catch((e) => e);
  assert.equal(toPublicError(noLink).status, 422);

  const weak = await createUser(admin, { name: "Admin Fraco", email: `af.${RUN}@x.com`, cpf: "862.247.150-09", role: "ADMIN", password: "Riale2026ok" }).catch((e) => e);
  assert.equal(toPublicError(weak).status, 422);

  const joao = await prisma.manager.findUniqueOrThrow({ where: { email: "joao.rocha@rialehoteis.com.br" } });
  if (!joao.userId) {
    const u = await createUser(rh, { name: "João Batista Rocha", email: "joao.rocha@rialehoteis.com.br", cpf: "862.247.150-09", role: "GESTOR", managerId: joao.id, password: "Riale2026ok" });
    assert.equal(u.role, "GESTOR");
    assert.ok(!("passwordHash" in u) && !("cpfEnc" in u));
    const linked = await prisma.manager.findUniqueOrThrow({ where: { id: joao.id } });
    assert.equal(linked.userId, u.id);
  }
  const selfOff = await updateUser(admin, admin.id, { active: false }).catch((e) => e);
  assert.equal(toPublicError(selfOff).status, 422);
});

test("Permissões: ADMIN não perde permissões críticas; RH não altera matriz", async () => {
  const admin = await asUser("admin@rialehoteis.com.br");
  const rh = await asUser("rh@rialehoteis.com.br");
  const locked = await setPermission(admin, "ADMIN", "permissions.manage", false).catch((e) => e);
  assert.equal(toPublicError(locked).status, 422);
  await assert.rejects(setPermission(rh, "RH", "settings.manage", true), isForbidden);
});

test("Recuperação de senha: resposta idêntica e token guardado apenas como hash", async () => {
  const before = await prisma.passwordResetToken.count();
  await requestPasswordReset({ cpf: "529.982.247-25", email: "errado@x.com" });
  assert.equal(await prisma.passwordResetToken.count(), before);
  await requestPasswordReset({ cpf: "529.982.247-25", email: "admin@rialehoteis.com.br" });
  const t = await prisma.passwordResetToken.findFirst({ orderBy: { createdAt: "desc" } });
  if (t && t.createdAt.getTime() > Date.now() - 10_000) {
    assert.match(t.tokenHash, /^[a-f0-9]{64}$/);
    const n = await prisma.notification.findFirst({ where: { template: "auth.password_reset" }, orderBy: { createdAt: "desc" } });
    assert.ok(n?.body.includes("/redefinir-senha?token="));
    assert.ok(!n!.body.includes(t.tokenHash));
  }
});

test("Banco: auditoria e movimentações são somente-inserção; CHECK de identificação do gestor", async () => {
  const log = await prisma.auditLog.findFirstOrThrow();
  await assert.rejects(prisma.auditLog.update({ where: { id: log.id }, data: { entityType: "x" } }), /somente inserção/);
  await assert.rejects(prisma.auditLog.delete({ where: { id: log.id } }), /somente inserção/);
  const m = await prisma.manager.findFirstOrThrow({ where: { cpfHash: null } });
  await assert.rejects(prisma.manager.update({ where: { id: m.id }, data: { internalId: null } }), /manager_identification_chk/);
});

test("Integridade relacional: chaves estrangeiras impedem órfãos", async () => {
  const orphans = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT
      (SELECT count(*) FROM "Department" d LEFT JOIN "Unit" u ON u.id = d."unitId" WHERE u.id IS NULL) +
      (SELECT count(*) FROM "Manager" m LEFT JOIN "Department" d ON d.id = m."departmentId" WHERE d.id IS NULL) +
      (SELECT count(*) FROM "Manager" m LEFT JOIN "Position" p ON p.id = m."positionId" WHERE p.id IS NULL) +
      (SELECT count(*) FROM "Manager" m LEFT JOIN "Manager" s ON s.id = m."directSuperiorId" WHERE m."directSuperiorId" IS NOT NULL AND s.id IS NULL) AS n`;
  assert.equal(Number(orphans[0].n), 0);
  const unit = await prisma.unit.findUniqueOrThrow({ where: { code: "BRISA" } });
  await assert.rejects(prisma.unit.delete({ where: { id: unit.id } }), (e: unknown) => toPublicError(e).status === 409);
  const fks = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'`;
  assert.ok(Number(fks[0].n) >= 40, `esperava >= 40 FKs, obtive ${fks[0].n}`);
});
