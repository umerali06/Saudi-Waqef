import { NextResponse } from "next/server";
import {
  buildExternalBalanceSheet,
  buildExternalCashFlow,
  buildExternalProfitLoss,
  buildExternalTrialBalance,
} from "@/lib/external/reports";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportType: string }> }
) {
  return withExternalApiAuth(request, ["read:reports"], async ({ companyId }) => {
    const { reportType } = await params;
    const { searchParams } = new URL(request.url);

    if (reportType === "trial-balance") {
      const report = await buildExternalTrialBalance({
        companyId,
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
        compareStartDate: searchParams.get("compareStartDate"),
        compareEndDate: searchParams.get("compareEndDate"),
      });
      return NextResponse.json({ data: report });
    }

    if (reportType === "profit-loss") {
      const report = await buildExternalProfitLoss({
        companyId,
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
        compareStartDate: searchParams.get("compareStartDate"),
        compareEndDate: searchParams.get("compareEndDate"),
      });
      return NextResponse.json({ data: report });
    }

    if (reportType === "balance-sheet") {
      const asOfDate = searchParams.get("asOfDate") ?? new Date().toISOString().slice(0, 10);
      const report = await buildExternalBalanceSheet({ companyId, asOfDate });
      return NextResponse.json({ data: report });
    }

    if (reportType === "cash-flow") {
      const startDate = searchParams.get("startDate");
      const endDate = searchParams.get("endDate");
      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: "startDate and endDate are required" },
          { status: 400 }
        );
      }
      const report = await buildExternalCashFlow({ companyId, startDate, endDate });
      return NextResponse.json({ data: report });
    }

    return NextResponse.json(
      {
        error: "Unsupported report type",
        supportedReportTypes: [
          "trial-balance",
          "profit-loss",
          "balance-sheet",
          "cash-flow",
        ],
      },
      { status: 404 }
    );
  });
}
