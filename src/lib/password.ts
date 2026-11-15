import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Hash fixo usado quando o usuário não existe — mantém tempo de resposta constante (anti-enumeração). */
export const DUMMY_HASH = "$2b$12$rrxXCAGLAvAJpuY4z//1Vu4cjMgGnGHVO.cB86I2U74zMqAhjJsPC";

/**
 * Política de senha. Perfis administrativos exigem senha mais forte, já que
 * o login é por CPF (dado semipúblico) — a senha é o fator que de fato protege.
 */
export function passwordPolicyErrors(password: string, role: Role): string[] {
  const errors: string[] = [];
  const min = role === "ADMIN" ? 12 : 10;
  if (password.length < min) errors.push(`mínimo de ${min} caracteres`);
  if (!/[a-z]/.test(password)) errors.push("ao menos uma letra minúscula");
  if (!/[A-Z]/.test(password)) errors.push("ao menos uma letra maiúscula");
  if (!/\d/.test(password)) errors.push("ao menos um número");
  if (role === "ADMIN" && !/[^A-Za-z0-9]/.test(password)) errors.push("ao menos um símbolo");
  if (/^(.)\1+$/.test(password)) errors.push("não pode repetir um único caractere");
  return errors;
}
