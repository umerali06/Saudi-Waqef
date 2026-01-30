import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { createImpersonation } from "@/lib/data/impersonations";
import { getMembership } from "@/lib/data/memberships";
import { getUserById } from "@/lib/data/users";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  targetUserId: z.string().min(1),
  companyId: z.string().optional(),
  reason: z.string().optional(),
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

  const targetUser = await getUserById(parsed.data.targetUserId);
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (parsed.data.companyId) {
    const membership = await getMembership({
      userId: parsed.data.targetUserId,
      companyId: parsed.data.companyId,
    });
    if (!membership) {
      return NextResponse.json(
        { error: "User not in company" },
        { status: 400 }
      );
    }
  }

  const impersonation = await createImpersonation({
    adminUserId: access.user?.id ?? "system",
    adminEmail: access.user?.email ?? null,
    targetUserId: targetUser.id,
    targetEmail: targetUser.email ?? null,
    companyId: parsed.data.companyId ?? null,
    reason: parsed.data.reason ?? null,
  });

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.impersonation.start",
    entity: "impersonation",
    entityId: impersonation?.id ?? undefined,
    metadata: {
      targetUserId: targetUser.id,
      targetEmail: targetUser.email ?? null,
      companyId: parsed.data.companyId ?? null,
      reason: parsed.data.reason ?? null,
    },
  });

  const response = NextResponse.json({
    impersonationId: impersonation?.id,
  });

  if (impersonation?.id) {
    response.cookies.set("impersonation_id", impersonation.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2 * 60 * 60,
    });
  }
  if (parsed.data.companyId) {
    response.cookies.set("active_company", parsed.data.companyId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
