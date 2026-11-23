import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { getUserByEmail, getUserById, updateUserPassword } from "@/lib/data/users";
import { clearAllLoginAttempts } from "@/lib/security/login-guard";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { getPasswordIssues } from "@/lib/security/password-policy";

export const runtime = "nodejs";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? undefined : value),
    schema
  );

const schema = z.object({
  userId: emptyToUndefined(z.string().trim().optional()),
  email: emptyToUndefined(z.string().trim().email().optional()),
  password: z.string(),
});

export async function POST(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { userId, email, password } = parsed.data;
  if (getPasswordIssues(password).length > 0) {
    return NextResponse.json({ error: "Weak password" }, { status: 400 });
  }
  const target = userId
    ? await getUserById(userId)
    : email
    ? await getUserByEmail(email)
    : null;
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await updateUserPassword(target.id, password);
  await clearAllLoginAttempts(target.email);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.user.reset_password",
    entity: "user",
    entityId: target.id,
  });

  return NextResponse.json({ success: true });
}
