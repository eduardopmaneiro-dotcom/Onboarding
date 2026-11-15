/**
 * Validação das variáveis de ambiente no build (falha cedo, com mensagem clara,
 * em vez de erro só quando alguém tenta cadastrar um CPF).
 */
try {
  process.loadEnvFile?.(".env");
} catch {}

const errors: string[] = [];
const need = (name: string, check: (v: string) => boolean, hint: string) => {
  const v = process.env[name];
  if (!v || !check(v)) errors.push(`- ${name}: ${hint}`);
};

need("DATABASE_URL", (v) => v.startsWith("postgres"), "URL do PostgreSQL/Neon ausente (conecte o banco ao projeto)");
need("DATABASE_URL_UNPOOLED", (v) => v.startsWith("postgres"), "URL direta do Neon ausente (criada pela integração Neon)");
need("AUTH_SECRET", (v) => v.length >= 32, "mínimo 32 caracteres (openssl rand -base64 32)");
need("CPF_HASH_PEPPER", (v) => v.length >= 16 && !v.includes("troque"), "mínimo 16 caracteres (openssl rand -base64 32)");
need("DATA_ENCRYPTION_KEY", (v) => Buffer.from(v, "base64").length === 32, "deve ter exatamente 32 bytes em base64 (openssl rand -base64 32)");

const prod = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
const bootstrap = process.env.BOOTSTRAP_TOKEN;
if (bootstrap && bootstrap.length < 16) errors.push("- BOOTSTRAP_TOKEN: mínimo 16 caracteres");
if (process.env.SEED_DEMO === "true" && process.env.VERCEL_ENV === "production") errors.push("- SEED_DEMO não pode ser usado em produção");

// E-mail: incompleto não impede o deploy (as mensagens ficam na fila), mas avisamos no log do build
const mail: string[] = [];
const provider = process.env.EMAIL_PROVIDER ?? (process.env.SMTP_HOST ? "smtp" : process.env.RESEND_API_KEY ? "resend" : "");
if (!provider) mail.push("EMAIL_PROVIDER");
if (!process.env.EMAIL_FROM) mail.push("EMAIL_FROM");
if (provider === "smtp") for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"]) if (!process.env[k]) mail.push(k);
if (provider === "resend" && !process.env.RESEND_API_KEY) mail.push("RESEND_API_KEY");
if (!process.env.CRON_SECRET) mail.push("CRON_SECRET");
if (mail.length) console.warn(`⚠ Comunicação por e-mail incompleta (as mensagens ficarão na fila): ${mail.join(", ")}`);

if (errors.length) {
  console.error(`\n✗ Variáveis de ambiente inválidas${prod ? " (produção)" : ""}:\n${errors.join("\n")}\n\nVeja docs/DEPLOY-VERCEL.md, Passo 4.\n`);
  process.exit(1);
}
console.log("✓ Variáveis de ambiente verificadas.");
