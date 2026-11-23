import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";
import { generalLedgerModel } from "@/lib/pdf/financial-reports";
import { loadReportContext, renderReport } from "@/lib/pdf/report";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

const isDateInRange = (date: string, startDate?: string | null, endDate?: string | null) => {
  if (startDate && date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const accountId = searchParams.get("accountId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!companyId || !accountId) {
    return NextResponse.json(
      { error: "companyId and accountId are required" },
      { status: 400 }
    );
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [accounts, entries] = await Promise.all([
    listChartAccounts(companyId),
    listJournalEntries(companyId),
  ]);

  const account = accounts.find((entry) => entry.id === accountId);
  if (!account) {
    return NextResponse.json({ error: "Invalid account" }, { status: 400 });
  }

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "general-ledger",
    format,
    filters: {
      accountId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    },
  });

  let openingBalance = 0;
  const lines: {
    date: string;
    memo: string;
    source: string;
    debit: number;
    credit: number;
    balance?: number;
  }[] = [];

  entries.forEach((entry) => {
    if (entry.status === "draft" || entry.status === "void") {
      return;
    }
    const isBeforeStart = startDate && entry.date < startDate;
    if (isBeforeStart) {
      entry.lines.forEach((line) => {
        if (line.accountId === accountId) {
          openingBalance += line.debit - line.credit;
        }
      });
      return;
    }

    if (!isDateInRange(entry.date, startDate, endDate)) {
      return;
    }

    entry.lines.forEach((line) => {
      if (line.accountId !== accountId) {
        return;
      }
      lines.push({
        date: entry.date,
        memo: entry.memo ?? "",
        source: entry.sourceType,
        debit: line.debit,
        credit: line.credit,
      });
    });
  });

  lines.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = openingBalance;
  const ledgerLines = lines.map((line) => {
    runningBalance += line.debit - line.credit;
    return { ...line, balance: runningBalance };
  });

  if (format === "pdf") {
    const context = await loadReportContext(request, companyId);
    const pdf = await renderReport(
      generalLedgerModel(context, {
        accountLabel: `${account.code} - ${account.name}`,
        startDate,
        endDate,
        openingBalance,
        closingBalance: runningBalance,
        lines: ledgerLines,
      })
    );
    return pdfResponse(pdf, `general-ledger-${account.code}.pdf`, request);
  }

  const headers = ["Date", "Memo", "Source", "Debit", "Credit", "Balance"];
  const rows = ledgerLines.map((line) => [
    line.date,
    line.memo ?? "",
    line.source,
    line.debit.toFixed(2),
    line.credit.toFixed(2),
    (line.balance ?? 0).toFixed(2),
  ]);
  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="general-ledger-${account.code}.csv"`,
    },
  });
}

