import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership, requireCompanyRole } from "@/lib/access";
import {
  listAttendanceHolidays,
  createAttendanceHoliday,
} from "@/lib/data/attendance-holidays";
import { attendanceHolidaySchema } from "@/lib/validators/attendance";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const holidays = await listAttendanceHolidays(companyId);
  return NextResponse.json({ holidays });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = attendanceHolidaySchema.safeParse(body);
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

  const holidayId = await createAttendanceHoliday(parsed.data);
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.holiday.create",
    entity: "attendance_holiday",
    entityId: holidayId,
    metadata: { date: parsed.data.date, name: parsed.data.name },
  });
  return NextResponse.json({ holidayId });
}

