import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { cpfHash, protectCpf } from "@/lib/cpf";
import { safeEqual, sha256 } from "@/lib/crypto";
import { hashPassword, passwordPolicyErrors } from "@/lib/password";
import { cpf, email, name } from "@/modules/shared/validation";
import { ValidationError } from "@/modules/shared/errors";

/**
 * Primeiro acesso (bootstrap) — cria o PRIMEIRO administrador.
 * Só funciona enquanto não existir nenhum usuário e exige DUAS provas:
 *  1) o CPF autorizado em BOOTSTRAP_ADMIN_CPF;
 *  2) o código secreto BOOTSTRAP_TOKEN (definido na Vercel, mín. 16 caracteres).
 * O CPF sozinho não basta (é dado semipúblico). Depois do 1º cadastro, fecha para sempre.
 */
function config() {
  const adminCpf = process.env.BOOTSTRAP_ADMIN_CPF;
  const token = process.env.BOOTSTRAP_TOKEN;
  if (!adminCpf || !token || token.length < 16) return null;
  return { adminCpf, token };
}

export async function isBootstrapOpen(): Promise<boolean> {
  if (!config()) return false;
  return (await prisma.user.count()) === 0;
}

const input = z.object({
  cpf,
  name: name(),
  email,
  token: z.string({ error: "Informe o código de configuração" }).min(1, "Informe o código de configuração"),
  password: z.string({ error: "Informe a senha" }),
  confirm: z.string({ error: "Confirme a senha" }),
});

export async function bootstrapAdmin(raw: unknown) {
  const cfg = config();
  if (!cfg) throw new ValidationError("Configuração inicial indisponível.");
  const data = input.parse(raw);

  const cpfOk = safeEqual(cpfHash(data.cpf), cpfHash(cfg.adminCpf));
  const tokenOk = safeEqual(sha256(data.token), sha256(cfg.token));
  if (!cpfOk || !tokenOk) {
    await recordAudit({ entityType: "Bootstrap", action: "ACCESS_DENIED", newValue: { cpfOk, tokenOk } });
    await new Promise((r) => setTimeout(r, 1500)); // desestimula tentativa e erro
    throw new ValidationError("CPF ou código de configuração inválidos.");
  }
  if (data.password !== data.confirm) throw new ValidationError("As senhas não conferem", { confirm: ["As senhas não conferem"] });
  const policy = passwordPolicyErrors(data.password, "ADMIN");
  if (policy.length) throw new ValidationError("Senha fora da política", { password: policy });

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`; // evita duas criações simultâneas
    if ((await tx.user.count()) > 0) throw new ValidationError("A configuração inicial já foi concluída.");
    return tx.user.create({
      data: { name: data.name, email: data.email, ...protectCpf(data.cpf), role: "ADMIN", passwordHash, passwordChangedAt: new Date(0) },
    });
  });
  await recordAudit({ entityType: "User", entityId: user.id, action: "CREATE", actorId: user.id, actorRole: "ADMIN", newValue: { name: user.name, email: user.email, role: user.role }, justification: "Primeiro acesso (bootstrap do administrador)" });
  return user;
}
