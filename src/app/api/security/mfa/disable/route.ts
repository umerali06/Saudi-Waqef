import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getUserSecurity, updateUserSecurity } from "@/lib/data/user-security";
import { decryptString } from "@/lib/security/crypto";
import { verifyMfaToken } from "@/lib/security/mfa";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const companyId = body?.companyId;
  const code = body?.code as string | undefined;
  if (!companyId || !code) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const security = await getUserSecurity(user.id);
  if (!security.mfaEnabled || !security.mfaSecret) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 409 });
  }

  const secret = decryptString(security.mfaSecret);
  if (!verifyMfaToken(secret, code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await updateUserSecurity(user.id, {
    mfaEnabled: false,
    mfaSecret: null,
    mfaTempSecret: null,
  });

  try {
    await recordAuditEvent({
      companyId: "system",
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "auth.mfa.disabled",
      entity: "user",
      entityId: user.id,
    });
  } catch {
    // Ignore audit failures.
  }

  return NextResponse.json({ success: true });
}


