import { z } from "zod";
import { isValidCpf, normalizeCpf } from "@/lib/cpf";

export const id = z.string().trim().min(1, "Obrigatório");
export const optionalId = z.string().trim().min(1).optional().nullable();
export const name = (label = "Nome") => z.string({ error: `${label} é obrigatório` }).trim().min(2, `${label}: mínimo 2 caracteres`).max(120);
export const email = z.string({ error: "E-mail é obrigatório" }).trim().toLowerCase().pipe(z.email("E-mail inválido")).pipe(z.string().max(160));
export const cpf = z.string({ error: "CPF é obrigatório" }).transform(normalizeCpf).refine(isValidCpf, "CPF inválido");
export const optionalCpf = z.string().transform(normalizeCpf).refine(isValidCpf, "CPF inválido").optional();
export const bool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.boolean());
