import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import {
  createAccountingPeriod,
  listAccountingPeriods,
} from "@/lib/data/accounting-periods";
import { accountingPeriodSchema } from "@/lib/validators/company";
import { periodsOverlap } from "@/lib/utils/periods";
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

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const periods = await listAccountingPeriods(companyId);
  return NextResponse.json({ periods });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountingPeriodSchema.safeParse(body);
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

  if (parsed.data.startDate > parsed.data.endDate) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const existing = await listAccountingPeriods(parsed.data.companyId);
  const overlap = existing.some((period) =>
    periodsOverlap(
      parsed.data.startDate,
      parsed.data.endDate,
      period.startDate,
      period.endDate
    )
  );
  if (overlap) {
    return NextResponse.json(
      { error: "Accounting period overlaps an existing period" },
      { status: 409 }
    );
  }

  const periodId = await createAccountingPeriod(parsed.data);
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "accounting_period.create",
    entity: "accounting_period",
    entityId: periodId,
    metadata: {
      name: parsed.data.name,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    },
  });
  return NextResponse.json({ periodId });
}

