import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { buildBalanceSheetReport } from "@/lib/utils/financial-statements";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";
import { balanceSheetModel } from "@/lib/pdf/financial-reports";
import { loadReportContext, renderReport } from "@/lib/pdf/report";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

const accountLabel = (account: { code: string; name: string }) =>
  account.code ? `${account.code} - ${account.name}` : account.name;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const asOfDate = searchParams.get("asOfDate") ?? new Date().toISOString().slice(0, 10);
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

  const report = buildBalanceSheetReport({ accounts, entries, asOfDate });

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "balance-sheet",
    format,
    filters: { asOfDate },
  });

  if (format === "pdf") {
    const context = await loadReportContext(request, companyId);
    const pdf = await renderReport(balanceSheetModel(context, report));
    return pdfResponse(pdf, "balance-sheet.pdf", request);
  }

  const headers = ["Section", "Account", "Amount"];
  const rows: string[][] = [];

  const pushSection = (label: string, section: typeof report.assets) => {
    rows.push([label, "", section.total.toFixed(2)]);
    section.accounts.forEach((account) => {
      rows.push([label, accountLabel(account), account.amount.toFixed(2)]);
    });
  };

  pushSection("Assets", report.assets);
  pushSection("Liabilities", report.liabilities);
  pushSection("Equity", report.equity);
  rows.push(["Liabilities + Equity", "", report.totals.liabilitiesEquity.toFixed(2)]);
  rows.push(["Difference", "", report.difference.toFixed(2)]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"balance-sheet.csv\"",
    },
  });
}

