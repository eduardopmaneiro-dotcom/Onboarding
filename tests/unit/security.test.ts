import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCpf, maskCpf, normalizeCpf, cpfHash, protectCpf, revealCpf } from "../../src/lib/cpf";
import { decrypt, encrypt, decryptBuffer, encryptBuffer } from "../../src/lib/crypto";
import { passwordPolicyErrors } from "../../src/lib/password";
import { redact } from "../../src/lib/audit";
import { PERMISSION_CATALOG, ADMIN_LOCKED } from "../../src/lib/permissions";
import { NAVIGATION } from "../../src/lib/navigation";

test("CPF: validação de dígitos verificadores", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("123"), false);
  assert.equal(normalizeCpf("529.982.247-25"), "52998224725");
});

test("CPF: máscara expõe apenas dígitos centrais", () => {
  assert.equal(maskCpf("52998224725"), "***.982.247-**");
});

test("CPF: hash determinístico e independente de máscara; cifra reversível e não determinística", () => {
  assert.equal(cpfHash("529.982.247-25"), cpfHash("52998224725"));
  const a = protectCpf("52998224725");
  const b = protectCpf("52998224725");
  assert.equal(a.cpfHash, b.cpfHash);
  assert.notEqual(a.cpfEnc, b.cpfEnc);
  assert.ok(!a.cpfEnc.includes("52998224725"));
  assert.equal(revealCpf(a.cpfEnc), "529.982.247-25");
});

test("AES-GCM detecta adulteração", () => {
  const c = encrypt("dado sensível");
  assert.equal(decrypt(c), "dado sensível");
  const parts = c.split(":");
  parts[3] = Buffer.from("xxxx").toString("base64");
  assert.throws(() => decrypt(parts.join(":")));
  const buf = encryptBuffer(Buffer.from("PDF"));
  assert.equal(decryptBuffer(buf).toString(), "PDF");
});

test("Política de senha: admin exige mais", () => {
  assert.deepEqual(passwordPolicyErrors("Riale2026ok", "RH"), []);
  assert.ok(passwordPolicyErrors("Riale2026ok", "ADMIN").length > 0);
  assert.deepEqual(passwordPolicyErrors("Riale@2026Seguro", "ADMIN"), []);
  assert.ok(passwordPolicyErrors("curta", "GESTOR").length > 0);
});

test("Auditoria nunca grava segredos", () => {
  const r = redact({ name: "x", passwordHash: "h", nested: { cpfEnc: "c", ok: 1 } });
  assert.deepEqual(r, { name: "x", passwordHash: "[protegido]", nested: { cpfEnc: "[protegido]", ok: 1 } });
});

test("Catálogo de permissões cobre o menu e o ADMIN mantém permissões críticas", () => {
  for (const n of NAVIGATION) assert.ok(n.permission in PERMISSION_CATALOG, n.permission);
  for (const code of ADMIN_LOCKED) assert.ok((PERMISSION_CATALOG[code].defaults as readonly string[]).includes("ADMIN"));
  // Os 11 itens exigidos na Fase 1 continuam no menu (Fase 2 acrescentou Aprovação e Importação)
  const required = ["Dashboard", "Vagas", "Candidatos", "Entrevistas", "Admissões", "Colaboradores", "Remuneração", "Pesquisa salarial", "Cargos e carreira", "Relatórios", "Configurações"];
  for (const label of required) assert.ok(NAVIGATION.some((n) => n.label === label), label);
  assert.ok(!(PERMISSION_CATALOG["permissions.manage"].defaults as readonly string[]).includes("RH"));
});
