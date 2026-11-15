import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { cpfHash } from "@/lib/cpf";
import { randomToken, sha256 } from "@/lib/crypto";
import { hashPassword, passwordPolicyErrors, verifyPassword } from "@/lib/password";
import type { CurrentUser } from "@/lib/session";
import { cpf, email } from "@/modules/shared/validation";
import { ValidationError } from "@/modules/shared/errors";
import { appUrl, enqueueNotification } from "@/modules/notifications/service";
import { requestMeta } from "@/lib/request";

export const RESET_TOKEN_MINUTES = 30;
const MAX_RESET_PER_HOUR = 3;

const resetRequestInput = z.object({ cpf, email });

/**
 * Solicitação de recuperação. Exige CPF + e-mail cadastrado (dois fatores de identificação)
 * e responde sempre da mesma forma, exista ou não a conta (anti-enumeração).
 * O token só existe no e-mail; no banco fica apenas o SHA-256.
 */
export async function requestPasswordReset(raw: unknown): Promise<void> {
  const data = resetRequestInput.parse(raw);
  const user = await prisma.user.findUnique({ where: { cpfHash: cpfHash(data.cpf) } });
  if (!user || !user.active || user.email !== data.email) {
    await recordAudit({ entityType: "Auth", action: "PASSWORD_RESET_REQUEST", newValue: { matched: false } });
    return;
  }
  const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= MAX_RESET_PER_HOUR) {
    await recordAudit({ entityType: "User", entityId: user.id, action: "PASSWORD_RESET_REQUEST", actorId: user.id, actorRole: user.role, newValue: { throttled: true } });
    return;
  }
  const token = randomToken();
  const { ip } = await requestMeta();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }), // invalida anteriores
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000), requestIp: ip },
    }),
  ]);
  const link = `${appUrl()}/redefinir-senha?token=${token}`;
  await enqueueNotification({
    recipientUserId: user.id,
    recipientEmail: user.email,
    template: "auth.password_reset",
    subject: "Riale Hotéis — redefinição de senha",
    body: `Olá, ${user.name.split(" ")[0]}.\n\nRecebemos um pedido para redefinir sua senha da Plataforma de RH.\nUse o link abaixo em até ${RESET_TOKEN_MINUTES} minutos:\n\n${link}\n\nSe não foi você, ignore este e-mail e avise o RH.`,
    relatedEntity: "User",
    relatedId: user.id,
  });
  await recordAudit({ entityType: "User", entityId: user.id, action: "PASSWORD_RESET_REQUEST", actorId: user.id, actorRole: user.role, newValue: { matched: true } });
}

export async function resetPasswordWithToken(token: string, newPassword: string, confirm: string) {
  if (!token) throw new ValidationError("Link inválido");
  if (newPassword !== confirm) throw new ValidationError("As senhas não conferem", { confirm: ["As senhas não conferem"] });
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date() || !rec.user.active) throw new ValidationError("Link inválido ou expirado. Solicite uma nova recuperação.");
  const policy = passwordPolicyErrors(newPassword, rec.user.role);
  if (policy.length) throw new ValidationError("Senha fora da política", { password: policy });
  await prisma.$transaction([
    prisma.user.update({
      where: { id: rec.userId },
      data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
  ]);
  await recordAudit({ entityType: "User", entityId: rec.userId, action: "PASSWORD_RESET", actorId: rec.userId, actorRole: rec.user.role, newValue: { by: "token" } });
}

export async function changeOwnPassword(user: CurrentUser, current: string, next: string, confirm: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(current, u.passwordHash))) throw new ValidationError("Senha atual incorreta", { current: ["Senha atual incorreta"] });
  if (next !== confirm) throw new ValidationError("As senhas não conferem", { confirm: ["As senhas não conferem"] });
  if (current === next) throw new ValidationError("A nova senha deve ser diferente da atual", { password: ["Use uma senha diferente"] });
  const policy = passwordPolicyErrors(next, u.role);
  if (policy.length) throw new ValidationError("Senha fora da política", { password: policy });
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date(), mustChangePassword: false },
  });
  await recordAudit({ entityType: "User", entityId: u.id, action: "PASSWORD_CHANGE", actorId: u.id, actorRole: u.role });
}
