import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { endImpersonation, getImpersonation } from "@/lib/data/impersonations";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser({ ignoreImpersonation: true });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const impersonationId = cookieStore.get("impersonation_id")?.value;
  if (!impersonationId) {
    return NextResponse.json({ success: true });
  }

  const impersonation = await getImpersonation(impersonationId);
  if (impersonation?.adminUserId === user.id && impersonation.status === "active") {
    await endImpersonation({ id: impersonationId, endedBy: user.id });
    await recordAuditEvent({
      companyId: "system",
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "admin.impersonation.end",
      entity: "impersonation",
      entityId: impersonationId,
    });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("impersonation_id", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
