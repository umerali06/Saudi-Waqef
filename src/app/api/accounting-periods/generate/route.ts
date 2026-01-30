import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  createAccountingPeriod,
  listAccountingPeriods,
} from "@/lib/data/accounting-periods";
import { accountingPeriodGenerateSchema } from "@/lib/validators/company";
import {
  buildMonthlyPeriods,
  buildQuarterlyPeriods,
  periodsOverlap,
} from "@/lib/utils/periods";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountingPeriodGenerateSchema.safeParse(body);
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

  const drafts =
    parsed.data.frequency === "monthly"
      ? buildMonthlyPeriods(parsed.data.year)
      : buildQuarterlyPeriods(parsed.data.year);
  const existing = await listAccountingPeriods(parsed.data.companyId);
  const hasOverlap = drafts.some((draft) =>
    existing.some((period) =>
      periodsOverlap(
        draft.startDate,
        draft.endDate,
        period.startDate,
        period.endDate
      )
    )
  );
  if (hasOverlap) {
    return NextResponse.json(
      { error: "Accounting period overlaps an existing period" },
      { status: 409 }
    );
  }

  const ids = [];
  for (const draft of drafts) {
    const periodId = await createAccountingPeriod({
      companyId: parsed.data.companyId,
      name: draft.name,
      startDate: draft.startDate,
      endDate: draft.endDate,
      frequency: draft.frequency,
    });
    ids.push(periodId);
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "accounting_period.generate",
    entity: "accounting_period",
    metadata: { year: parsed.data.year, frequency: parsed.data.frequency },
  });
  return NextResponse.json({ periodIds: ids });
}
