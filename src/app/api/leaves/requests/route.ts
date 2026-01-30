import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { listLeaveTypes } from "@/lib/data/leave-types";
import { createLeaveRequest, listLeaveRequests } from "@/lib/data/leave-requests";
import { listEmployees, getEmployeeByUserId } from "@/lib/data/employees";
import { leaveRequestSchema } from "@/lib/validators/leave";
import { calculateLeaveDays } from "@/lib/utils/leave";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const employeeIdParam = searchParams.get("employeeId");
  const status = searchParams.get("status");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let employeeId = employeeIdParam;
  if (!hasRequiredRole(membership.role, ["owner", "admin", "hr"])) {
    const employee = await getEmployeeByUserId(companyId, user.id);
    if (!employee) {
      return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });
    }
    employeeId = employee.id;
  }

  const requests = await listLeaveRequests(companyId);
  const filtered = requests.filter((request) => {
    if (employeeId && request.employeeId !== employeeId) {
      return false;
    }
    if (status && status !== "all" && request.status !== status) {
      return false;
    }
    return true;
  });

  return NextResponse.json({ requests: filtered });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasRequiredRole(membership.role, ["owner", "admin", "hr"])) {
    const employee = await getEmployeeByUserId(parsed.data.companyId, user.id);
    if (!employee || employee.id !== parsed.data.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (parsed.data.startDate > parsed.data.endDate) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const [types, employees] = await Promise.all([
    listLeaveTypes(parsed.data.companyId),
    listEmployees(parsed.data.companyId),
  ]);

  const leaveType = types.find((type) => type.id === parsed.data.leaveTypeId);
  if (!leaveType || leaveType.status !== "active") {
    return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
  }

  const employeeExists = employees.some((employee) => employee.id === parsed.data.employeeId);
  if (!employeeExists) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const days = calculateLeaveDays(parsed.data.startDate, parsed.data.endDate);
  if (days <= 0) {
    return NextResponse.json({ error: "Invalid leave duration" }, { status: 400 });
  }

  const requestId = await createLeaveRequest({
    ...parsed.data,
    days,
    status: "pending",
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "leave.request.create",
    entity: "leave_request",
    entityId: requestId,
    metadata: { employeeId: parsed.data.employeeId, days },
  });

  return NextResponse.json({ requestId });
}
