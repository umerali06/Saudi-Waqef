import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership, requireCompanyRole } from "@/lib/access";
import { leaveRequestUpdateSchema } from "@/lib/validators/leave";
import { getLeaveRequest, updateLeaveRequest, listLeaveRequests } from "@/lib/data/leave-requests";
import { listLeaveTypes } from "@/lib/data/leave-types";
import { listLeaveAdjustments } from "@/lib/data/leave-adjustments";
import { getEmployeeByUserId } from "@/lib/data/employees";
import { getEmployeeById } from "@/lib/data/employees";
import { isDateInYear } from "@/lib/utils/leave";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyUser } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveRequestUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await context.params;
  const requestRecord = await getLeaveRequest(requestId);
  if (!requestRecord || requestRecord.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (requestRecord.status !== "pending") {
    return NextResponse.json({ error: "Request already processed" }, { status: 400 });
  }

  if (parsed.data.status === "cancelled") {
    if (!hasRequiredRole(membership.role, ["owner", "admin", "hr"])) {
      const employee = await getEmployeeByUserId(parsed.data.companyId, user.id);
      if (!employee || employee.id !== requestRecord.employeeId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    await updateLeaveRequest(requestId, {
      status: "cancelled",
      decidedAt: new Date(),
      approvedBy: user.id,
      reason: parsed.data.reason ?? requestRecord.reason ?? null,
    });
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "leave.request.cancel",
      entity: "leave_request",
      entityId: requestId,
    });
    return NextResponse.json({ ok: true });
  }

  const roleMembership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!roleMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.status === "approved") {
    const [types, adjustments, requests] = await Promise.all([
      listLeaveTypes(parsed.data.companyId),
      listLeaveAdjustments(parsed.data.companyId),
      listLeaveRequests(parsed.data.companyId),
    ]);
    const leaveType = types.find((type) => type.id === requestRecord.leaveTypeId);
    if (!leaveType) {
      return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
    }
    const year = new Date().getFullYear();
    const used = requests
      .filter(
        (entry) =>
          entry.employeeId === requestRecord.employeeId &&
          entry.leaveTypeId === requestRecord.leaveTypeId &&
          entry.status === "approved" &&
          isDateInYear(entry.startDate, year)
      )
      .reduce((sum, entry) => sum + entry.days, 0);
    const adjustmentTotal = adjustments
      .filter(
        (adj) =>
          adj.employeeId === requestRecord.employeeId &&
          adj.leaveTypeId === requestRecord.leaveTypeId
      )
      .reduce((sum, adj) => sum + adj.amount, 0);
    const available = leaveType.defaultAllowance + adjustmentTotal - used;
    if (leaveType.isPaid && available < requestRecord.days) {
      return NextResponse.json(
        { error: "Insufficient leave balance" },
        { status: 400 }
      );
    }
    await updateLeaveRequest(requestId, {
      status: "approved",
      approvedBy: user.id,
      decidedAt: new Date(),
      reason: parsed.data.reason ?? requestRecord.reason ?? null,
    });
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "leave.request.approve",
      entity: "leave_request",
      entityId: requestId,
    });

    const employee = await getEmployeeById(requestRecord.employeeId);
    if (employee?.userId) {
      await notifyUser({
        userId: employee.userId,
        companyId: parsed.data.companyId,
        type: "leave_approved",
        data: {
          startDate: requestRecord.startDate,
          endDate: requestRecord.endDate,
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "rejected") {
    await updateLeaveRequest(requestId, {
      status: "rejected",
      approvedBy: user.id,
      decidedAt: new Date(),
      reason: parsed.data.reason ?? requestRecord.reason ?? null,
    });
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "leave.request.reject",
      entity: "leave_request",
      entityId: requestId,
    });

    const employee = await getEmployeeById(requestRecord.employeeId);
    if (employee?.userId) {
      await notifyUser({
        userId: employee.userId,
        companyId: parsed.data.companyId,
        type: "leave_rejected",
        data: {
          startDate: requestRecord.startDate,
          endDate: requestRecord.endDate,
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
