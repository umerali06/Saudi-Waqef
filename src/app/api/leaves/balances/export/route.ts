import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { listLeaveTypes } from "@/lib/data/leave-types";
import { listLeaveRequests } from "@/lib/data/leave-requests";
import { listLeaveAdjustments } from "@/lib/data/leave-adjustments";
import { listEmployees, getEmployeeByUserId } from "@/lib/data/employees";
import { isDateInYear } from "@/lib/utils/leave";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const employeeIdParam = searchParams.get("employeeId");
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

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

  const [types, requests, adjustments, employees] = await Promise.all([
    listLeaveTypes(companyId),
    listLeaveRequests(companyId),
    listLeaveAdjustments(companyId),
    listEmployees(companyId),
  ]);

  const activeTypes = types.filter((type) => type.status === "active");
  const targetEmployees = employeeId
    ? employees.filter((employee) => employee.id === employeeId)
    : employees;

  const rows: string[][] = [];
  targetEmployees.forEach((employee) => {
    activeTypes.forEach((type) => {
      const used = requests
        .filter(
          (request) =>
            request.employeeId === employee.id &&
            request.leaveTypeId === type.id &&
            request.status === "approved" &&
            isDateInYear(request.startDate, year)
        )
        .reduce((sum, request) => sum + request.days, 0);

      const adjustmentTotal = adjustments
        .filter(
          (adjustment) =>
            adjustment.employeeId === employee.id && adjustment.leaveTypeId === type.id
        )
        .reduce((sum, adjustment) => sum + adjustment.amount, 0);

      const allowance = type.defaultAllowance;
      const balance = allowance + adjustmentTotal - used;
      rows.push([
        String(year),
        employee.employeeNumber ?? "",
        employee.nameAr ?? "",
        employee.nameEn ?? "",
        type.name ?? "",
        type.code ?? "",
        String(allowance ?? 0),
        String(adjustmentTotal ?? 0),
        String(used ?? 0),
        String(balance ?? 0),
      ]);
    });
  });

  const headers = [
    "year",
    "employeeNumber",
    "employeeNameAr",
    "employeeNameEn",
    "leaveType",
    "leaveTypeCode",
    "allowance",
    "adjustments",
    "used",
    "balance",
  ];

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=leave-balances.csv",
      "Cache-Control": "no-store",
    },
  });
}
