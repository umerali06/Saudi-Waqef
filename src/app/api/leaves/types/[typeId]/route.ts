import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { leaveTypeUpdateSchema } from "@/lib/validators/leave";
import { getLeaveType, updateLeaveType, deleteLeaveType } from "@/lib/data/leave-types";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ typeId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveTypeUpdateSchema.safeParse(body);
  if (!parsed.success || typeof body?.companyId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, body.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { typeId } = await context.params;
  const leaveType = await getLeaveType(typeId);
  if (!leaveType || leaveType.companyId !== body.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updates = { ...parsed.data };
  delete updates.companyId;
  await updateLeaveType(typeId, updates);

  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "leave.type.update",
    entity: "leave_type",
    entityId: typeId,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { typeId } = await context.params;
  const leaveType = await getLeaveType(typeId);
  if (!leaveType || leaveType.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteLeaveType(typeId);

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "leave.type.delete",
    entity: "leave_type",
    entityId: typeId,
  });

  return NextResponse.json({ ok: true });
}
