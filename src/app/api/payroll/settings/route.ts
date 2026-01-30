import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { getPayrollSettings, updatePayrollSettings } from "@/lib/data/payroll-settings";
import {
  payrollSettingsSchema,
  payrollSettingsUpdateSchema,
} from "@/lib/validators/payroll";
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

  const membership = await requireHrAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getPayrollSettings(companyId);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed =
    body?.companyId && body.overtimeMultiplier !== undefined
      ? payrollSettingsSchema.safeParse(body)
      : payrollSettingsUpdateSchema.safeParse(body);
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

  await updatePayrollSettings(body.companyId, parsed.data);
  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "payroll.settings.update",
    entity: "payroll_settings",
    entityId: body.companyId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

