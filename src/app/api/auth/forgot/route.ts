import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/data/users";
import {
  createPasswordReset,
  generateResetToken,
} from "@/lib/data/password-resets";
import { queueEmailWithDispatch } from "@/lib/email/queue";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  locale: z.enum(["ar", "en"]).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await getUserByEmail(email);
  if (!user || user.status !== "active") {
    return NextResponse.json({ ok: true });
  }

  const token = generateResetToken();
  const ttlMinutes = Number.parseInt(process.env.PASSWORD_RESET_TTL_MINUTES ?? "30", 10) || 30;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await createPasswordReset({
    userId: user.id,
    email: user.email,
    token,
    expiresAt,
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const locale = parsed.data.locale ?? "ar";
  const subject =
    locale === "ar" ? "إعادة تعيين كلمة المرور" : "Reset your password";
  const bodyHtml =
    locale === "ar"
      ? `<p>طلبت إعادة تعيين كلمة المرور.</p><p><a href="${resetUrl}">إعادة التعيين الآن</a></p>`
      : `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset now</a></p>`;

  await queueEmailWithDispatch({
    companyId: "system",
    to: user.email,
    subject,
    body: bodyHtml,
    sourceType: "password_reset",
    sourceId: user.id,
  });

  return NextResponse.json({ ok: true });
}
