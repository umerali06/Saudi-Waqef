import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { listLeaveTypes } from "@/lib/data/leave-types";
import { listLeaveRequests } from "@/lib/data/leave-requests";
import { listEmployees, getEmployeeByUserId } from "@/lib/data/employees";
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

  const [types, requests, employees] = await Promise.all([
    listLeaveTypes(companyId),
    listLeaveRequests(companyId),
    listEmployees(companyId),
  ]);

  const typeMap = new Map(types.map((type) => [type.id, type]));
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  const filtered = requests.filter((request) => {
    if (employeeId && request.employeeId !== employeeId) {
      return false;
    }
    if (status && status !== "all" && request.status !== status) {
      return false;
    }
    return true;
  });

  const headers = [
    "employeeNumber",
    "employeeNameAr",
    "employeeNameEn",
    "leaveType",
    "leaveTypeCode",
    "startDate",
    "endDate",
    "days",
    "status",
    "reason",
  ];
  const rows = filtered.map((request) => {
    const employee = employeeMap.get(request.employeeId);
    const type = typeMap.get(request.leaveTypeId);
    return [
      employee?.employeeNumber ?? "",
      employee?.nameAr ?? "",
      employee?.nameEn ?? "",
      type?.name ?? "",
      type?.code ?? "",
      request.startDate,
      request.endDate,
      String(request.days ?? 0),
      request.status ?? "",
      request.reason ?? "",
    ];
  });

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=leave-requests.csv",
      "Cache-Control": "no-store",
    },
  });
}
