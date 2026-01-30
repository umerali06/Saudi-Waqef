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
import { computeAttendanceMetrics } from "@/lib/utils/attendance";
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

  const metrics = computeAttendanceMetrics({
    checkIn: parsed.data.checkIn ?? record.checkIn ?? null,
    checkOut: parsed.data.checkOut ?? record.checkOut ?? null,
    shiftStart: settings.shiftStart,
    shiftEnd: settings.shiftEnd,
    graceMinutes: settings.graceMinutes,
    roundingMinutes: settings.roundingMinutes,
    overtimeThresholdMinutes: settings.overtimeThresholdMinutes,
  });

  const isHoliday = holidays.some((holiday) => holiday.date === record.date);
  const status =
    parsed.data.status ?? (isHoliday ? "holiday" : metrics.status);

  await updateAttendanceRecord(recordId, {
    checkIn: parsed.data.checkIn ?? record.checkIn ?? null,
    checkOut: parsed.data.checkOut ?? record.checkOut ?? null,
    status,
    totalMinutes: metrics.totalMinutes,
    overtimeMinutes: metrics.overtimeMinutes,
    lateMinutes: metrics.lateMinutes,
    earlyMinutes: metrics.earlyMinutes,
    notes: parsed.data.notes ?? record.notes ?? null,
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
