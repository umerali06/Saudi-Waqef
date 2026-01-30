import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { listAttendanceRecords } from "@/lib/data/attendance-records";
import { listEmployees, getEmployeeByUserId } from "@/lib/data/employees";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

const isDateInRange = (date: string, start?: string | null, end?: string | null) => {
  if (start && date < start) {
    return false;
  }
  if (end && date > end) {
    return false;
  }
  return true;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const employeeIdParam = searchParams.get("employeeId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
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

  const [records, employees] = await Promise.all([
    listAttendanceRecords(companyId),
    listEmployees(companyId),
  ]);

  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const filtered = records.filter((record) => {
    if (employeeId && record.employeeId !== employeeId) {
      return false;
    }
    if (status && status !== "all" && record.status !== status) {
      return false;
    }
    return isDateInRange(record.date, startDate, endDate);
  });

  const headers = [
    "date",
    "employeeNumber",
    "employeeNameAr",
    "employeeNameEn",
    "status",
    "checkIn",
    "checkOut",
    "totalMinutes",
    "overtimeMinutes",
    "lateMinutes",
    "earlyMinutes",
    "source",
    "notes",
  ];
  const rows = filtered.map((record) => {
    const employee = employeeMap.get(record.employeeId);
    return [
      record.date,
      employee?.employeeNumber ?? "",
      employee?.nameAr ?? "",
      employee?.nameEn ?? "",
      record.status ?? "",
      record.checkIn ?? "",
      record.checkOut ?? "",
      String(record.totalMinutes ?? 0),
      String(record.overtimeMinutes ?? 0),
      String(record.lateMinutes ?? 0),
      String(record.earlyMinutes ?? 0),
      record.source ?? "",
      record.notes ?? "",
    ];
  });

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=attendance-records.csv",
      "Cache-Control": "no-store",
    },
  });
}
