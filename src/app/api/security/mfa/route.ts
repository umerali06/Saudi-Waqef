import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getUserSecurity } from "@/lib/data/user-security";
import { getMfaIssuer } from "@/lib/security/mfa";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const security = await getUserSecurity(user.id);
  return NextResponse.json({
    mfaEnabled: security.mfaEnabled,
    mfaPending: Boolean(security.mfaTempSecret),
    issuer: getMfaIssuer(),
  });
}


