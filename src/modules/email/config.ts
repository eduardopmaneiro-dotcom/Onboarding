/**
 * Configuração do e-mail — somente por variáveis de ambiente (credenciais nunca no banco).
 *   EMAIL_PROVIDER = smtp | resend
 *   EMAIL_FROM     = "Recursos Humanos — Riale Hotéis <rh@rialehoteis.com.br>"
 *   EMAIL_REPLY_TO = (opcional) endereço para respostas dos gestores
 *   SMTP:   SMTP_HOST, SMTP_PORT (465 ou 587), SMTP_SECURE (true p/ 465), SMTP_USER, SMTP_PASSWORD
 *   Resend: RESEND_API_KEY
 */
export type EmailProvider = "smtp" | "resend";

export type EmailConfig = {
  provider: EmailProvider | null;
  from: string | null;
  replyTo: string | null;
  ready: boolean;
  missing: string[];
};

export function emailConfig(): EmailConfig {
  const env = process.env;
  const explicit = (env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const provider: EmailProvider | null = explicit === "smtp" || explicit === "resend" ? explicit : env.SMTP_HOST ? "smtp" : env.RESEND_API_KEY ? "resend" : null;
  const missing: string[] = [];
  if (!provider) missing.push("EMAIL_PROVIDER (smtp ou resend)");
  if (!env.EMAIL_FROM) missing.push("EMAIL_FROM");
  if (provider === "smtp") for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"]) if (!env[k]) missing.push(k);
  if (provider === "resend" && !env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  return { provider, from: env.EMAIL_FROM ?? null, replyTo: env.EMAIL_REPLY_TO || null, ready: missing.length === 0, missing };
}

/** Texto exibido no painel quando falta configuração (exatamente o que precisa ser feito). */
export const EMAIL_SETUP_GUIDE = [
  { name: "EMAIL_PROVIDER", example: "smtp", note: "smtp (e-mail corporativo) ou resend" },
  { name: "EMAIL_FROM", example: "Recursos Humanos — Riale Hotéis <rh@rialehoteis.com.br>", note: "remetente; deve ser uma conta/alias autorizado no provedor" },
  { name: "EMAIL_REPLY_TO", example: "rh@rialehoteis.com.br", note: "opcional — para onde vão as respostas dos gestores" },
  { name: "SMTP_HOST", example: "smtp.gmail.com  ou  smtp.office365.com", note: "Google Workspace ou Microsoft 365" },
  { name: "SMTP_PORT", example: "465 (Google) · 587 (Microsoft)", note: "" },
  { name: "SMTP_SECURE", example: "true para 465 · false para 587", note: "" },
  { name: "SMTP_USER", example: "rh@rialehoteis.com.br", note: "conta que envia" },
  { name: "SMTP_PASSWORD", example: "senha de app (Google) / senha da conta com SMTP AUTH (Microsoft)", note: "credencial — só na Vercel, nunca no código" },
  { name: "CRON_SECRET", example: "valor aleatório (openssl rand -base64 32)", note: "protege a rota do fechamento automático" },
];
