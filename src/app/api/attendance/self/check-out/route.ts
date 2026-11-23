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
import {
  computeAttendanceMetrics,
  isOvernightShift,
  isRestDay,
} from "@/lib/utils/attendance";
import { addDays } from "@/lib/utils/dates";
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

  let existing = await findAttendanceRecord({
    companyId,
    employeeId: employee.id,
    date,
  });
  if (!existing?.checkIn && isOvernightShift(settings)) {
    // A night shift that started yesterday is closed on yesterday's record.
    const previous = await findAttendanceRecord({
      companyId,
      employeeId: employee.id,
      date: addDays(date, -1),
    });
    if (previous?.checkIn && !previous.checkOut) {
      existing = previous;
    }
  }

  const restDay = isRestDay(existing?.date ?? date, settings.weekendDays, holidays);
  const metrics = computeAttendanceMetrics({
    checkIn: existing?.checkIn ?? null,
    checkOut: time,
    shiftStart: settings.shiftStart,
    shiftEnd: settings.shiftEnd,
    graceMinutes: settings.graceMinutes,
    roundingMinutes: settings.roundingMinutes,
    overtimeThresholdMinutes: settings.overtimeThresholdMinutes,
    isRestDay: restDay,
  });
  const status = restDay ? "holiday" : metrics.status;

  if (existing) {
    await updateAttendanceRecord(existing.id, {
      checkOut: time,
      status,
      totalMinutes: metrics.totalMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyMinutes: metrics.earlyMinutes,
    });
    return NextResponse.json({ ok: true, recordId: existing.id });
  }

  const recordId = await createAttendanceRecord({
    companyId,
    employeeId: employee.id,
    date,
    checkIn: null,
    checkOut: time,
    status,
    totalMinutes: metrics.totalMinutes,
    overtimeMinutes: metrics.overtimeMinutes,
    lateMinutes: metrics.lateMinutes,
    earlyMinutes: metrics.earlyMinutes,
    source: "self",
    notes: null,
    createdBy: user.id,
  });

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.self.checkout",
    entity: "attendance_record",
    entityId: recordId,
    metadata: { date },
  });

  return NextResponse.json({ ok: true, recordId });
}
