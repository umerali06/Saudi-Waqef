import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { getVatPeriodById } from "@/lib/data/vat-periods";
import { buildVatSummary } from "@/lib/utils/vat-report";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const periodId = searchParams.get("periodId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let periodStart = startDate ?? "";
  let periodEnd = endDate ?? "";

  if (periodId) {
    const period = await getVatPeriodById(periodId);
    if (!period || period.companyId !== companyId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    periodStart = period.startDate;
    periodEnd = period.endDate;

    if (period.status === "filed" && period.filedSummary) {
      return NextResponse.json({ summary: period.filedSummary });
    }
  }

  if (!periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 }
    );
  }

  const summary = await buildVatSummary({
    companyId,
    startDate: periodStart,
    endDate: periodEnd,
    periodId: periodId ?? null,
  });

  return NextResponse.json({ summary });
}

