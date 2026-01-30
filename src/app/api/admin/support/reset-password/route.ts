import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { getUserByEmail, updateUserPassword } from "@/lib/data/users";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { getPasswordIssues } from "@/lib/security/password-policy";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
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
  let resolvedUserId = userId ?? null;
  if (!resolvedUserId && email) {
    const user = await getUserByEmail(email);
    resolvedUserId = user?.id ?? null;
  }

  if (!resolvedUserId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await updateUserPassword(resolvedUserId, password);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.user.reset_password",
    entity: "user",
    entityId: resolvedUserId,
  });

  return NextResponse.json({ success: true });
}
