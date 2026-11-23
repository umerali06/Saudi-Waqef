import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { getUserById, updateUserPassword } from "@/lib/data/users";
import { verifyPassword } from "@/lib/security/password";
import { getPasswordIssues } from "@/lib/security/password-policy";
import { getLoginThrottle, registerFailedLogin } from "@/lib/security/login-guard";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(request: Request) {
  const sessionUser = await getSessionUser({ ignoreImpersonation: true });
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const user = await getUserById(sessionUser.id);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Wrong guesses here count towards the same lock as the sign-in form.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const throttle = await getLoginThrottle(user.email, ip);
  if (throttle.locked) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    await registerFailedLogin({
      email: user.email,
      ip,
      userId: user.id,
      reason: "change_password",
    });
    return NextResponse.json({ error: "Wrong password" }, { status: 400 });
  }
  if (getPasswordIssues(parsed.data.newPassword).length > 0) {
    return NextResponse.json({ error: "Weak password" }, { status: 400 });
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json({ error: "Same password" }, { status: 400 });
  }

  await updateUserPassword(user.id, parsed.data.newPassword);
  await recordAuditEvent({
    companyId: "system",
    userId: user.id,
    userEmail: user.email,
    action: "auth.password.changed",
    entity: "user",
    entityId: user.id,
  });

  return NextResponse.json({ success: true });
}
