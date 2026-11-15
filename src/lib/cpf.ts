import { decrypt, encrypt, hmac } from "@/lib/crypto";

/** Remove máscara: "123.456.789-09" -> "12345678909" */
export function normalizeCpf(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/** Validação oficial dos dígitos verificadores (Receita Federal). */
export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function formatCpf(cpf: string): string {
  const d = normalizeCpf(cpf);
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/** Exibição padrão: apenas 3º–9º dígitos visíveis ("***.456.789-**"), conforme prática da ANPD. */
export function maskCpf(cpf: string): string {
  const d = normalizeCpf(cpf);
  if (d.length !== 11) return "***.***.***-**";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function cpfHash(cpf: string): string {
  return hmac(`cpf:${normalizeCpf(cpf)}`);
}

export function protectCpf(cpf: string): { cpfHash: string; cpfEnc: string } {
  const d = normalizeCpf(cpf);
  return { cpfHash: cpfHash(d), cpfEnc: encrypt(d) };
}

export function revealCpf(cpfEnc: string): string {
  return formatCpf(decrypt(cpfEnc));
}

export function maskedFromEnc(cpfEnc: string | null | undefined): string {
  if (!cpfEnc) return "—";
  try {
    return maskCpf(decrypt(cpfEnc));
  } catch {
    return "***.***.***-**";
  }
}
