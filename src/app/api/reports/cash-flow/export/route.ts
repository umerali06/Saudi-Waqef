import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { buildCashFlowReport } from "@/lib/utils/financial-statements";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";
import { cashFlowModel } from "@/lib/pdf/financial-reports";
import { loadReportContext, renderReport } from "@/lib/pdf/report";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!companyId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "companyId, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [accounts, entries, cashAccounts] = await Promise.all([
    listChartAccounts(companyId),
    listJournalEntries(companyId),
    listCashBankAccounts(companyId),
  ]);

  const report = buildCashFlowReport({
    accounts,
    entries,
    cashAccounts: cashAccounts.map((account) => ({
      accountId: account.accountId,
      name: account.name,
      openingBalance: account.openingBalance,
    })),
    startDate,
    endDate,
  });

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "cash-flow",
    format,
    filters: { startDate, endDate },
  });

  if (format === "pdf") {
    const context = await loadReportContext(request, companyId);
    const pdf = await renderReport(cashFlowModel(context, report));
    return pdfResponse(pdf, "cash-flow.pdf", request);
  }

  const headers = ["Section", "Item", "Amount"];
  const rows: string[][] = [
    ["Summary", "Opening cash", report.openingCash.toFixed(2)],
    ["Summary", "Net profit", report.netProfit.toFixed(2)],
    ["Summary", "Asset change", report.assetChange.toFixed(2)],
    ["Summary", "Liability change", report.liabilityChange.toFixed(2)],
    ["Summary", "Equity change", report.equityChange.toFixed(2)],
    ["Summary", "Net cash from operations", report.netCashFromOperations.toFixed(2)],
    ["Summary", "Net cash from investing", report.netCashFromInvesting.toFixed(2)],
    ["Summary", "Net cash from financing", report.netCashFromFinancing.toFixed(2)],
    ["Summary", "Other change", report.otherChange.toFixed(2)],
    ["Summary", "Net cash change", report.netCashChange.toFixed(2)],
    ["Summary", "Closing cash", report.closingCash.toFixed(2)],
  ];

  report.cashAccounts.forEach((account) => {
    rows.push([
      "Cash accounts",
      account.name,
      `${account.opening.toFixed(2)} -> ${account.closing.toFixed(2)} (${account.change.toFixed(
        2
      )})`,
    ]);
  });

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"cash-flow.csv\"",
    },
  });
}

