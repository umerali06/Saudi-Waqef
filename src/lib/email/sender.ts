import nodemailer from "nodemailer";
import { htmlToText, wrapEmailBody } from "@/lib/email/template";

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
  /** Shown before the platform name, so customers see which company wrote to them. */
  fromName?: string | null;
  replyTo?: string | null;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

type EmailConfig = {
  fromName: string;
  fromAddress: string;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
};

export function getEmailConfig(): EmailConfig | null {
  const host = process.env.EMAIL_SMTP_HOST?.trim();
  const portValue = process.env.EMAIL_SMTP_PORT?.trim();
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (!host || !fromAddress) {
    return null;
  }
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "Saudi Waqef";
  const port = Number(portValue ?? "587");
  return {
    host,
    port: Number.isNaN(port) ? 587 : port,
    secure: String(process.env.EMAIL_SMTP_SECURE ?? "false") === "true",
    fromName,
    fromAddress,
    user: process.env.EMAIL_SMTP_USER?.trim() || undefined,
    pass: process.env.EMAIL_SMTP_PASS?.trim() || undefined,
  };
}

export async function sendEmail(message: EmailMessage) {
  const config = getEmailConfig();
  if (!config) {
    throw new Error("Email not configured");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Mail is sent inside web requests, so an unreachable server must fail quickly.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });

  const html = wrapEmailBody(message.body);
  await transporter.sendMail({
    from: {
      name: message.fromName ? `${message.fromName} (${config.fromName})` : config.fromName,
      address: config.fromAddress,
    },
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    attachments: message.attachments,
    to: message.to,
    subject: message.subject,
    html,
    text: htmlToText(html),
  });
}
