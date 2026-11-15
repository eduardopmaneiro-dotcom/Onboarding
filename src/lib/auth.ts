import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cpfHash, isValidCpf, normalizeCpf } from "@/lib/cpf";
import { DUMMY_HASH, verifyPassword } from "@/lib/password";
import { recordAudit } from "@/lib/audit";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; name: string; email: string; pwdAt: number };
  }
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const SESSION_HOURS = 8;

class AccountLocked extends CredentialsSignin {
  code = "locked";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_HOURS * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { cpf: { label: "CPF" }, password: { label: "Senha", type: "password" } },
      authorize: async (credentials) => {
        const cpf = normalizeCpf(String(credentials?.cpf ?? ""));
        const password = String(credentials?.password ?? "");
        // Senha é sempre obrigatória: não existe autenticação apenas com CPF, para nenhum perfil.
        if (!isValidCpf(cpf) || password.length === 0) return null;

        const user = await prisma.user.findUnique({ where: { cpfHash: cpfHash(cpf) } });
        if (!user) {
          await verifyPassword(password, DUMMY_HASH); // tempo constante (anti-enumeração)
          await recordAudit({ entityType: "Auth", action: "LOGIN_FAILED", newValue: { reason: "unknown_user" } });
          return null;
        }
        if (!user.active) {
          await recordAudit({ entityType: "User", entityId: user.id, action: "LOGIN_FAILED", actorId: user.id, actorRole: user.role, newValue: { reason: "inactive" } });
          return null;
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await recordAudit({ entityType: "User", entityId: user.id, action: "LOGIN_FAILED", actorId: user.id, actorRole: user.role, newValue: { reason: "locked" } });
          throw new AccountLocked();
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          const failed = user.failedLoginCount + 1;
          const lock = failed >= MAX_FAILED_LOGINS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: lock ? 0 : failed,
              lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
            },
          });
          await recordAudit({ entityType: "User", entityId: user.id, action: "LOGIN_FAILED", actorId: user.id, actorRole: user.role, newValue: { reason: "bad_password", attempt: failed, locked: lock } });
          if (lock) throw new AccountLocked();
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await recordAudit({ entityType: "User", entityId: user.id, action: "LOGIN", actorId: user.id, actorRole: user.role });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          pwdAt: user.passwordChangedAt?.getTime() ?? 0,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as { id: string; role: Role; pwdAt: number };
        token.id = u.id;
        token.role = u.role;
        token.pwdAt = u.pwdAt;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      session.user.pwdAt = (token.pwdAt as number) ?? 0;
      return session;
    },
  },
});
