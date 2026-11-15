import nodemailer from "nodemailer";
import { emailConfig } from "@/modules/email/config";

export type OutgoingEmail = { to: string; cc?: string[]; subject: string; text: string; html?: string | null };

export class EmailNotConfiguredError extends Error {
  constructor(public missing: string[]) {
    super(`E-mail não configurado: ${missing.join(", ")}`);
  }
}

let smtpCache: { key: string; transporter: nodemailer.Transporter } | null = null;

function smtpTransporter() {
  const e = process.env;
  const key = [e.SMTP_HOST, e.SMTP_PORT, e.SMTP_USER, e.SMTP_SECURE].join("|");
  if (smtpCache?.key === key) return smtpCache.transporter;
  const port = Number(e.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port,
    secure: e.SMTP_SECURE ? e.SMTP_SECURE === "true" : port === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    tls: e.SMTP_TLS_REJECT_UNAUTHORIZED === "false" ? { rejectUnauthorized: false } : undefined,
  });
  smtpCache = { key, transporter };
  return transporter;
}

/** Envia pelo provedor configurado. Lança erro em qualquer falha — quem chama decide a nova tentativa. */
export async function sendEmail(msg: OutgoingEmail): Promise<{ providerId: string | null }> {
  const cfg = emailConfig();
  if (!cfg.ready) throw new EmailNotConfiguredError(cfg.missing);
  if (cfg.provider === "smtp") {
    const info = await smtpTransporter().sendMail({
      from: cfg.from!,
      to: msg.to,
      cc: msg.cc?.length ? msg.cc : undefined,
      replyTo: cfg.replyTo ?? undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? undefined,
    });
    if (info.rejected?.length) throw new Error(`Destinatário recusado pelo servidor: ${info.rejected.join(", ")}`);
    return { providerId: info.messageId ?? null };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [msg.to], cc: msg.cc?.length ? msg.cc : undefined, reply_to: cfg.replyTo ?? undefined, subject: msg.subject, text: msg.text, html: msg.html ?? undefined }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${body.message ?? "erro"}`);
  return { providerId: body.id ?? null };
}
