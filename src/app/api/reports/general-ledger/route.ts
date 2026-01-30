import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";

export const runtime = "nodejs";

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

  let openingBalance = 0;
  const lines = [];

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
        entryId: entry.id,
        date: entry.date,
        memo: entry.memo ?? "",
        sourceType: entry.sourceType,
        sourceId: entry.sourceId ?? null,
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

  return NextResponse.json({
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
    },
    openingBalance,
    closingBalance: runningBalance,
    lines: ledgerLines,
    range: { startDate: startDate ?? null, endDate: endDate ?? null },
  });
}

