import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership } from "@/lib/access";
import {
  createAttendanceRecord,
  findAttendanceRecord,
  updateAttendanceRecord,
} from "@/lib/data/attendance-records";
import { getEmployeeByUserId } from "@/lib/data/employees";
import { getAttendanceSettings } from "@/lib/data/attendance-settings";
import { listAttendanceHolidays } from "@/lib/data/attendance-holidays";
import { computeAttendanceMetrics } from "@/lib/utils/attendance";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const companyId = body?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employee = await getEmployeeByUserId(companyId, user.id);
  if (!employee) {
    return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });
  }

  const now = new Date();
  const date = formatDate(now);
  const time = formatTime(now);

  const [settings, holidays] = await Promise.all([
    getAttendanceSettings(companyId),
    listAttendanceHolidays(companyId),
  ]);

  const isHoliday = holidays.some((holiday) => holiday.date === date);
  const existing = await findAttendanceRecord({
    companyId,
    employeeId: employee.id,
    date,
  });

  if (existing) {
    const metrics = computeAttendanceMetrics({
      checkIn: time,
      checkOut: existing.checkOut ?? null,
      shiftStart: settings.shiftStart,
      shiftEnd: settings.shiftEnd,
      graceMinutes: settings.graceMinutes,
      roundingMinutes: settings.roundingMinutes,
      overtimeThresholdMinutes: settings.overtimeThresholdMinutes,
    });
    const status = existing.checkOut
      ? metrics.status
      : isHoliday
      ? "holiday"
      : "present";
    await updateAttendanceRecord(existing.id, {
      checkIn: time,
      status,
      totalMinutes: existing.checkOut ? metrics.totalMinutes : existing.totalMinutes,
      overtimeMinutes: existing.checkOut ? metrics.overtimeMinutes : existing.overtimeMinutes,
      lateMinutes: existing.checkOut ? metrics.lateMinutes : existing.lateMinutes,
      earlyMinutes: existing.checkOut ? metrics.earlyMinutes : existing.earlyMinutes,
    });
    return NextResponse.json({ ok: true, recordId: existing.id });
  }

  const metrics = computeAttendanceMetrics({
    checkIn: time,
    checkOut: null,
    shiftStart: settings.shiftStart,
    shiftEnd: settings.shiftEnd,
    graceMinutes: settings.graceMinutes,
    roundingMinutes: settings.roundingMinutes,
    overtimeThresholdMinutes: settings.overtimeThresholdMinutes,
  });

  const recordId = await createAttendanceRecord({
    companyId,
    employeeId: employee.id,
    date,
    checkIn: time,
    checkOut: null,
    status: isHoliday ? "holiday" : "present",
    totalMinutes: 0,
    overtimeMinutes: 0,
    lateMinutes: metrics.lateMinutes,
    earlyMinutes: 0,
    source: "self",
    notes: null,
    createdBy: user.id,
  });

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.self.checkin",
    entity: "attendance_record",
    entityId: recordId,
    metadata: { date },
  });

  return NextResponse.json({ ok: true, recordId });
}
