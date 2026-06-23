import { NextResponse } from "next/server";
import { getVatPeriodById } from "@/lib/data/vat-periods";
import { withExternalApiAuth } from "@/lib/security/external-api";
import { buildVatSummary } from "@/lib/utils/vat-report";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:reports"], async ({ companyId }) => {
    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get("periodId");
    let periodStart = searchParams.get("startDate") ?? "";
    let periodEnd = searchParams.get("endDate") ?? "";

    if (periodId) {
      const period = await getVatPeriodById(periodId);
      if (!period || period.companyId !== companyId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      periodStart = period.startDate;
      periodEnd = period.endDate;

      if (period.status === "filed" && period.filedSummary) {
        return NextResponse.json({ data: period.filedSummary });
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

    return NextResponse.json({ data: summary });
  });
}
