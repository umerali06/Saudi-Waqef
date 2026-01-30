import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { vatPeriodUpdateSchema } from "@/lib/validators/company";
import { getVatPeriodById, updateVatPeriod } from "@/lib/data/vat-periods";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { buildVatSummary } from "@/lib/utils/vat-report";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ periodId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vatPeriodUpdateSchema.safeParse(body);
  if (!parsed.success || typeof body?.companyId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, body.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { periodId } = await context.params;
  const period = await getVatPeriodById(periodId);
  if (!period || period.companyId !== body.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.status === "filed") {
    const summary = await buildVatSummary({
      companyId: body.companyId,
      startDate: period.startDate,
      endDate: period.endDate,
      periodId,
    });
    await updateVatPeriod(periodId, {
      status: "filed",
      filedBy: user.id,
      filedAt: new Date(),
      filedSummary: summary,
    });
  } else {
    await updateVatPeriod(periodId, {
      status: "open",
      filedBy: null,
      filedAt: null,
      filedSummary: null,
    });
  }

  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vat_period.update",
    entity: "vat_period",
    entityId: periodId,
    metadata: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true });
}
