import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Criptografia de dados pessoais (LGPD art. 46 — medidas de segurança).
 * - hmac(): pseudonimização determinística (permite busca/unicidade sem guardar o valor).
 * - encrypt()/decrypt(): AES-256-GCM autenticado, formato "v1:<iv>:<tag>:<ciphertext>" (base64).
 */

function getKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY não configurada");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY deve ter 32 bytes (base64)");
  return key;
}

function getPepper(): string {
  const pepper = process.env.CPF_HASH_PEPPER;
  if (!pepper || pepper.length < 16) throw new Error("CPF_HASH_PEPPER não configurado");
  return pepper;
}

export function hmac(value: string): string {
  return createHmac("sha256", getPepper()).update(value).digest("hex");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1") throw new Error("Formato de cifra desconhecido");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Cifra binária (documentos): [iv(12)][tag(16)][dados] */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(payload: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", getKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
