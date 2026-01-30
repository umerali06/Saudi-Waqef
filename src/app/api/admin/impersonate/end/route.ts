import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { endImpersonation } from "@/lib/data/impersonations";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function POST() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const cookieStore = await cookies();
  const impersonationId = cookieStore.get("impersonation_id")?.value;
  if (!impersonationId) {
    return NextResponse.json({ success: true });
  }

  await endImpersonation({
    id: impersonationId,
    endedBy: access.user?.id ?? "system",
  });

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.impersonation.end",
    entity: "impersonation",
    entityId: impersonationId,
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set("impersonation_id", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
