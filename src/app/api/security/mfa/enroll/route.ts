import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getUserSecurity, updateUserSecurity } from "@/lib/data/user-security";
import { encryptString } from "@/lib/security/crypto";
import { generateMfaSecret } from "@/lib/security/mfa";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const companyId = body?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const security = await getUserSecurity(user.id);
  if (security.mfaEnabled) {
    return NextResponse.json({ error: "MFA already enabled" }, { status: 409 });
  }

  const { secret, otpauth } = generateMfaSecret(user.email ?? user.id);
  await updateUserSecurity(user.id, {
    mfaTempSecret: encryptString(secret),
    mfaEnabled: false,
  });

  try {
    await recordAuditEvent({
      companyId: "system",
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "auth.mfa.enroll_start",
      entity: "user",
      entityId: user.id,
    });
  } catch {
    // Ignore audit failures.
  }

  return NextResponse.json({ secret, otpauth });
}


