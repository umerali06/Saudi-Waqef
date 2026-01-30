import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  updateAttendanceHoliday,
  deleteAttendanceHoliday,
} from "@/lib/data/attendance-holidays";
import { attendanceHolidayUpdateSchema } from "@/lib/validators/attendance";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ holidayId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = attendanceHolidayUpdateSchema.safeParse(body);
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

  const { holidayId } = await context.params;
  await updateAttendanceHoliday(holidayId, parsed.data);
  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.holiday.update",
    entity: "attendance_holiday",
    entityId: holidayId,
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

  const { holidayId } = await context.params;
  await deleteAttendanceHoliday(holidayId);
  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.holiday.delete",
    entity: "attendance_holiday",
    entityId: holidayId,
  });
  return NextResponse.json({ ok: true });
}
