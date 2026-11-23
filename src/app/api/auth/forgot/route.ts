import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/data/users";
import {
  createPasswordReset,
  generateResetToken,
} from "@/lib/data/password-resets";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { renderEmail } from "@/lib/email/template";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email(),
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

  const baseUrl = (process.env.NEXTAUTH_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const locale = parsed.data.locale ?? "ar";
  const subject =
    locale === "ar" ? "إعادة تعيين كلمة المرور" : "Reset your password";
  const bodyHtml = renderEmail(
    locale === "ar"
      ? {
          locale,
          heading: subject,
          paragraphs: [
            `مرحبًا ${user.name}،`,
            `وصلنا طلب لإعادة تعيين كلمة مرور حسابك. الرابط صالح لمدة ${ttlMinutes} دقيقة.`,
            "إن لم تطلب ذلك فتجاهل هذه الرسالة، وتبقى كلمة مرورك كما هي.",
          ],
          action: { label: "إعادة تعيين كلمة المرور", url: resetUrl },
        }
      : {
          locale,
          heading: subject,
          paragraphs: [
            `Hello ${user.name},`,
            `We received a request to reset the password of your account. The link works for ${ttlMinutes} minutes.`,
            "If you did not ask for this, ignore this message and your password stays the same.",
          ],
          action: { label: "Reset password", url: resetUrl },
        }
  );

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
