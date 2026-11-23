import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { leaveAdjustmentSchema } from "@/lib/validators/leave";
import { listLeaveAdjustments, createLeaveAdjustment } from "@/lib/data/leave-adjustments";
import { getEmployeeById } from "@/lib/data/employees";
import { riyadhYear } from "@/lib/utils/riyadh";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const employeeId = searchParams.get("employeeId");
  const leaveTypeId = searchParams.get("leaveTypeId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireHrAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adjustments = await listLeaveAdjustments(companyId);
  const filtered = adjustments.filter((adjustment) => {
    if (employeeId && adjustment.employeeId !== employeeId) {
      return false;
    }
    if (leaveTypeId && adjustment.leaveTypeId !== leaveTypeId) {
      return false;
    }
    return true;
  });

  return NextResponse.json({ adjustments: filtered });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employee = await getEmployeeById(parsed.data.employeeId);
  if (!employee || employee.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const adjustmentId = await createLeaveAdjustment({
    ...parsed.data,
    year: parsed.data.year ?? riyadhYear(),
    createdBy: user.id,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "leave.adjustment.create",
    entity: "leave_adjustment",
    entityId: adjustmentId,
    metadata: { employeeId: parsed.data.employeeId, amount: parsed.data.amount },
  });

  return NextResponse.json({ adjustmentId });
}

