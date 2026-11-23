import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
} from "@/lib/data/attendance-records";
import { attendanceRecordUpdateSchema } from "@/lib/validators/attendance";
import { getAttendanceSettings } from "@/lib/data/attendance-settings";
import { listAttendanceHolidays } from "@/lib/data/attendance-holidays";
import { computeAttendanceMetrics, isRestDay } from "@/lib/utils/attendance";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = attendanceRecordUpdateSchema.safeParse(body);
  if (!parsed.success || typeof body?.companyId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, body.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { recordId } = await context.params;
  const record = await getAttendanceRecord(recordId);
  if (!record || record.companyId !== body.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [settings, holidays] = await Promise.all([
    getAttendanceSettings(body.companyId),
    listAttendanceHolidays(body.companyId),
  ]);

  const checkIn =
    parsed.data.checkIn !== undefined ? parsed.data.checkIn : record.checkIn ?? null;
  const checkOut =
    parsed.data.checkOut !== undefined ? parsed.data.checkOut : record.checkOut ?? null;
  const restDay = isRestDay(record.date, settings.weekendDays, holidays);
  const metrics = computeAttendanceMetrics({
    checkIn,
    checkOut,
    shiftStart: settings.shiftStart,
    shiftEnd: settings.shiftEnd,
    graceMinutes: settings.graceMinutes,
    roundingMinutes: settings.roundingMinutes,
    overtimeThresholdMinutes: settings.overtimeThresholdMinutes,
    isRestDay: restDay,
  });

  const status = parsed.data.status ?? (restDay ? "holiday" : metrics.status);

  await updateAttendanceRecord(recordId, {
    checkIn,
    checkOut,
    status,
    totalMinutes: metrics.totalMinutes,
    overtimeMinutes: metrics.overtimeMinutes,
    lateMinutes: metrics.lateMinutes,
    earlyMinutes: metrics.earlyMinutes,
    notes: parsed.data.notes !== undefined ? parsed.data.notes : record.notes ?? null,
  });

  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.record.update",
    entity: "attendance_record",
    entityId: recordId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { recordId } = await context.params;
  const record = await getAttendanceRecord(recordId);
  if (!record || record.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteAttendanceRecord(recordId);
  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.record.delete",
    entity: "attendance_record",
    entityId: recordId,
  });
  return NextResponse.json({ ok: true });
}
