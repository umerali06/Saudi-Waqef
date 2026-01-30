import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import {
  listVatAdjustments,
  createVatAdjustment,
} from "@/lib/data/vat-adjustments";
import { getVatPeriodById } from "@/lib/data/vat-periods";
import { vatAdjustmentSchema } from "@/lib/validators/company";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const periodId = searchParams.get("periodId");
  if (!companyId || !periodId) {
    return NextResponse.json(
      { error: "companyId and periodId are required" },
      { status: 400 }
    );
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = await getVatPeriodById(periodId);
  if (!period || period.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const adjustments = await listVatAdjustments(companyId, periodId);
  return NextResponse.json({ adjustments });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vatAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = await getVatPeriodById(parsed.data.periodId);
  if (!period || period.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (period.status === "filed") {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const adjustmentId = await createVatAdjustment({
    ...parsed.data,
    createdBy: user.id,
    createdByEmail: user.email ?? null,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vat_adjustment.create",
    entity: "vat_adjustment",
    entityId: adjustmentId,
    metadata: {
      periodId: parsed.data.periodId,
      type: parsed.data.type,
      amount: parsed.data.amount,
    },
  });

  return NextResponse.json({ adjustmentId });
}

