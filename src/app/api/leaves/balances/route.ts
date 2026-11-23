import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { listLeaveTypes } from "@/lib/data/leave-types";
import { listLeaveRequests } from "@/lib/data/leave-requests";
import { listLeaveAdjustments } from "@/lib/data/leave-adjustments";
import { listEmployees, getEmployeeByUserId } from "@/lib/data/employees";
import { listAttendanceHolidays } from "@/lib/data/attendance-holidays";
import { computeLeaveBalance } from "@/lib/utils/leave";
import { riyadhYear } from "@/lib/utils/riyadh";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const employeeIdParam = searchParams.get("employeeId");
  const year = Number(searchParams.get("year") ?? riyadhYear());

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

  const [types, requests, adjustments, employees, holidays] = await Promise.all([
    listLeaveTypes(companyId),
    listLeaveRequests(companyId),
    listLeaveAdjustments(companyId),
    listEmployees(companyId),
    listAttendanceHolidays(companyId),
  ]);

  const activeTypes = types.filter((type) => type.status === "active");
  const targetEmployees = employeeId
    ? employees.filter((employee) => employee.id === employeeId)
    : employees;

  const balances: Array<{
    employeeId: string;
    employeeName: string;
    leaveTypeId: string;
    leaveTypeName: string;
    allowance: number;
    adjustments: number;
    used: number;
    balance: number;
  }> = [];

  targetEmployees.forEach((employee) => {
    activeTypes.forEach((type) => {
      const {
        allowance,
        adjustments: adjustmentTotal,
        used,
        balance,
      } = computeLeaveBalance({
        employeeId: employee.id,
        leaveType: type,
        year,
        requests,
        adjustments,
        holidays,
      });
      balances.push({
        employeeId: employee.id,
        employeeName: employee.nameEn || employee.nameAr,
        leaveTypeId: type.id,
        leaveTypeName: type.name,
        allowance,
        adjustments: adjustmentTotal,
        used,
        balance,
      });
    });
  });

  return NextResponse.json({
    balances,
    year,
  });
}
