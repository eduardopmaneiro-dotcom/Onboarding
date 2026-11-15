import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/session";

export class ValidationError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string[]> = {}) {
    super(message);
  }
}
export class NotFoundError extends Error {
  constructor(message = "Registro não encontrado") {
    super(message);
  }
}
export class ConflictError extends Error {}

export { ForbiddenError };

const UNIQUE_LABEL: Record<string, string> = {
  email: "e-mail",
  cpfHash: "CPF",
  internalId: "matrícula",
  code: "código",
  name: "nome",
  title: "cargo",
};

/** Converte erros de domínio/Prisma/Zod em mensagem amigável + status HTTP. */
export function toPublicError(err: unknown): { status: number; message: string; fieldErrors?: Record<string, string[]> } {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const k = issue.path.join(".") || "_";
      (fieldErrors[k] ??= []).push(issue.message);
    }
    return { status: 422, message: "Dados inválidos. Revise os campos destacados.", fieldErrors };
  }
  if (err instanceof ValidationError) return { status: 422, message: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof ForbiddenError) return { status: 403, message: err.message };
  if (err instanceof NotFoundError) return { status: 404, message: err.message };
  if (err instanceof ConflictError) return { status: 409, message: err.message };
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = ([] as string[]).concat((err.meta?.target as string[] | string) ?? []);
      const fields = target.map((t) => UNIQUE_LABEL[t] ?? t).join(", ");
      return { status: 409, message: `Já existe um registro com o mesmo ${fields || "valor único"}.` };
    }
    if (err.code === "P2003") return { status: 409, message: "Registro relacionado inexistente ou em uso." };
    if (err.code === "P2025") return { status: 404, message: "Registro não encontrado." };
  }
  console.error(err);
  return { status: 500, message: "Erro interno. Tente novamente ou contate o administrador." };
}
