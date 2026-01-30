import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
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
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });

  await transporter.sendMail({
    from: `${config.fromName} <${config.fromAddress}>`,
    to: message.to,
    subject: message.subject,
    html: message.body,
    text: message.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  });
}
