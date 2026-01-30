import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { listAttendanceRecords } from "@/lib/data/attendance-records";
import { getEmployeeByUserId } from "@/lib/data/employees";

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

  const records = await listAttendanceRecords(companyId);
  const filtered = records.filter((record) => {
    if (employeeId && record.employeeId !== employeeId) {
      return false;
    }
    return isDateInRange(record.date, startDate, endDate);
  });

  const totals = filtered.reduce(
    (acc, record) => {
      acc.totalMinutes += record.totalMinutes;
      acc.overtimeMinutes += record.overtimeMinutes;
      acc.lateMinutes += record.lateMinutes;
      acc.earlyMinutes += record.earlyMinutes;
      if (record.status === "present" || record.status === "late") {
        acc.presentDays += 1;
      } else if (record.status === "absent") {
        acc.absentDays += 1;
      } else if (record.status === "leave") {
        acc.leaveDays += 1;
      } else if (record.status === "holiday") {
        acc.holidayDays += 1;
      }
      if (record.status === "late") {
        acc.lateDays += 1;
      }
      return acc;
    },
    {
      totalMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyMinutes: 0,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      holidayDays: 0,
      lateDays: 0,
    }
  );

  return NextResponse.json({
    totals,
    range: { startDate: startDate ?? null, endDate: endDate ?? null },
  });
}

