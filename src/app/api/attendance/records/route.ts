import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyMembership, requireCompanyRole } from "@/lib/access";
import {
  listAttendanceRecords,
  createAttendanceRecord,
  findAttendanceRecord,
} from "@/lib/data/attendance-records";
import { listEmployees, getEmployeeByUserId } from "@/lib/data/employees";
import { getAttendanceSettings } from "@/lib/data/attendance-settings";
import { listAttendanceHolidays } from "@/lib/data/attendance-holidays";
import { attendanceRecordSchema } from "@/lib/validators/attendance";
import { computeAttendanceMetrics } from "@/lib/utils/attendance";
import { recordAuditEvent } from "@/lib/data/audit-log";

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

const isWeekend = (date: string, weekendDays: number[]) => {
  const day = new Date(date).getDay();
  return weekendDays.includes(day);
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

  const records = await listAttendanceRecords(companyId);
  const filtered = records.filter((record) => {
    if (employeeId && record.employeeId !== employeeId) {
      return false;
    }
    if (status && status !== "all" && record.status !== status) {
      return false;
    }
    return isDateInRange(record.date, startDate, endDate);
  });

  return NextResponse.json({ records: filtered });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = attendanceRecordSchema.safeParse(body);
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

  const existing = await findAttendanceRecord({
    companyId: parsed.data.companyId,
    employeeId: parsed.data.employeeId,
    date: parsed.data.date,
  });
  if (existing) {
    return NextResponse.json({ error: "Attendance already exists" }, { status: 409 });
  }

  const [settings, holidays, employees] = await Promise.all([
    getAttendanceSettings(parsed.data.companyId),
    listAttendanceHolidays(parsed.data.companyId),
    listEmployees(parsed.data.companyId),
  ]);

  const employeeExists = employees.some((employee) => employee.id === parsed.data.employeeId);
  if (!employeeExists) {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const isHoliday = holidays.some((holiday) => holiday.date === parsed.data.date);
  const weekend = isWeekend(parsed.data.date, settings.weekendDays);

  const metrics = computeAttendanceMetrics({
    checkIn: parsed.data.checkIn ?? null,
    checkOut: parsed.data.checkOut ?? null,
    shiftStart: settings.shiftStart,
    shiftEnd: settings.shiftEnd,
    graceMinutes: settings.graceMinutes,
    roundingMinutes: settings.roundingMinutes,
    overtimeThresholdMinutes: settings.overtimeThresholdMinutes,
  });

  const status =
    parsed.data.status ??
    (isHoliday ? "holiday" : weekend ? "holiday" : metrics.status);

  const recordId = await createAttendanceRecord({
    companyId: parsed.data.companyId,
    employeeId: parsed.data.employeeId,
    date: parsed.data.date,
    checkIn: parsed.data.checkIn ?? null,
    checkOut: parsed.data.checkOut ?? null,
    status,
    totalMinutes: metrics.totalMinutes,
    overtimeMinutes: metrics.overtimeMinutes,
    lateMinutes: metrics.lateMinutes,
    earlyMinutes: metrics.earlyMinutes,
    source: parsed.data.source ?? "manual",
    notes: parsed.data.notes ?? null,
    createdBy: user.id,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.record.create",
    entity: "attendance_record",
    entityId: recordId,
    metadata: { employeeId: parsed.data.employeeId, date: parsed.data.date },
  });

  return NextResponse.json({ recordId });
}

