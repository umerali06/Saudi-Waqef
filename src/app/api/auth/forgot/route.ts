import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordReset, generateResetToken } from "@/lib/data/password-resets";
import { listRecentRequests } from "@/lib/data/registration-requests";
import { getSystemAdminEmails } from "@/lib/data/system-admins";
import { createUser, getUserByEmail } from "@/lib/data/users";
import { sendDocumentEmail } from "@/lib/email/queue";
import { passwordResetMail, requestPendingMail } from "@/lib/email/registration-mails";
import { logger } from "@/lib/ops/logger";
import { takeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(["ar", "en"]).optional(),
});

const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;
const WINDOW_MINUTES = 60;

/**
 * Addresses in SYSTEM_ADMIN_EMAILS get their account here: nobody could approve the
 * first administrator's request. The emailed link is what proves they own the address.
 */
async function createConfiguredAdmin(email: string) {
  if (!getSystemAdminEmails().includes(email)) return null;
  return createUser({
    id: crypto.randomUUID(),
    email,
    name: email.split("@")[0],
    password: crypto.randomBytes(32).toString("base64url"),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const locale = parsed.data.locale ?? "ar";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const allowed =
      (await takeRateLimit(`forgot:ip:${ip}`, MAX_PER_IP, WINDOW_MINUTES)) &&
      (await takeRateLimit(`forgot:email:${email}`, MAX_PER_EMAIL, WINDOW_MINUTES));
    if (!allowed) {
      return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
    }

    const baseUrl = (process.env.NEXTAUTH_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, "");
    const user = (await getUserByEmail(email)) ?? (await createConfiguredAdmin(email));

    if (!user || user.status !== "active") {
      // Someone still waiting for approval would otherwise wait for a mail that never comes.
      const { pending } = await listRecentRequests({ emailLower: email });
      if (pending.length > 0) {
        const mail = requestPendingMail({ locale, companyName: pending[0].companyName });
        await sendDocumentEmail({
          companyId: "system",
          to: email,
          subject: mail.subject,
          body: mail.body,
          sourceType: "registration_received",
          sourceId: pending[0].id,
        });
      }
      return NextResponse.json({ ok: true });
    }

    const token = generateResetToken();
    const ttlMinutes = Number.parseInt(process.env.PASSWORD_RESET_TTL_MINUTES ?? "30", 10) || 30;
    await createPasswordReset({
      userId: user.id,
      email: user.email,
      token,
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    });

    const mail = passwordResetMail({
      locale,
      name: user.name,
      ttlMinutes,
      resetUrl: `${baseUrl}/reset-password?token=${token}`,
    });
    const sent = await sendDocumentEmail({
      companyId: "system",
      to: user.email,
      subject: mail.subject,
      body: mail.body,
      sourceType: "password_reset",
      sourceId: user.id,
    });
    if (!sent.ok) {
      return NextResponse.json({ error: "EMAIL_FAILED" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Password reset request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
