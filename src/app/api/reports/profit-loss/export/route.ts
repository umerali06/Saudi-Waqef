import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { buildProfitLossReport } from "@/lib/utils/financial-statements";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";
import { profitLossModel } from "@/lib/pdf/financial-reports";
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
  const compareStartDate = searchParams.get("compareStartDate");
  const compareEndDate = searchParams.get("compareEndDate");
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [accounts, entries] = await Promise.all([
    listChartAccounts(companyId),
    listJournalEntries(companyId),
  ]);

  const report = buildProfitLossReport({
    accounts,
    entries,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    compareStartDate: compareStartDate ?? null,
    compareEndDate: compareEndDate ?? null,
  });

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "profit-loss",
    format,
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      compareStartDate: compareStartDate ?? null,
      compareEndDate: compareEndDate ?? null,
    },
  });

  if (format === "pdf") {
    const context = await loadReportContext(request, companyId);
    const pdf = await renderReport(profitLossModel(context, report));
    return pdfResponse(pdf, "profit-loss.pdf", request);
  }

  const includeCompare = Boolean(report.comparePeriod);
  const headers = includeCompare
    ? ["Section", "Account", "Amount", "CompareAmount"]
    : ["Section", "Account", "Amount"];
  const rows: string[][] = [];

  const pushSection = (label: string, section: typeof report.revenue, compare?: typeof report.revenue) => {
    rows.push([label, "", section.total.toFixed(2), compare?.total.toFixed(2) ?? ""]);
    section.accounts.forEach((account) => {
      const compareAccount = compare?.accounts.find((item) => item.accountId === account.accountId);
      rows.push([
        label,
        `${account.code} - ${account.name}`,
        account.amount.toFixed(2),
        compareAccount ? compareAccount.amount.toFixed(2) : "",
      ]);
    });
  };

  pushSection("Revenue", report.revenue, report.compare?.revenue);
  pushSection("COGS", report.cogs, report.compare?.cogs);
  rows.push([
    "Gross profit",
    "",
    report.grossProfit.toFixed(2),
    report.compare ? report.compare.grossProfit.toFixed(2) : "",
  ]);
  pushSection("Expenses", report.expenses, report.compare?.expenses);
  rows.push([
    "Net profit",
    "",
    report.netProfit.toFixed(2),
    report.compare ? report.compare.netProfit.toFixed(2) : "",
  ]);

  const csv = toCsv(headers, rows.map((row) => (includeCompare ? row : row.slice(0, 3))));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"profit-loss.csv\"",
    },
  });
}

