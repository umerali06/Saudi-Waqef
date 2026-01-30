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
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const compareStartDate = searchParams.get("compareStartDate");
  const compareEndDate = searchParams.get("compareEndDate");

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

  const totals = new Map<
    string,
    {
      opening: { debit: number; credit: number };
      movement: { debit: number; credit: number };
      compare: { debit: number; credit: number };
    }
  >();

  entries.forEach((entry) => {
    if (entry.status === "draft" || entry.status === "void") {
      return;
    }
    entry.lines.forEach((line) => {
      const current = totals.get(line.accountId) ?? {
        opening: { debit: 0, credit: 0 },
        movement: { debit: 0, credit: 0 },
        compare: { debit: 0, credit: 0 },
      };

      if (startDate && entry.date < startDate) {
        current.opening.debit += line.debit;
        current.opening.credit += line.credit;
      } else if (isDateInRange(entry.date, startDate, endDate)) {
        current.movement.debit += line.debit;
        current.movement.credit += line.credit;
      }

      if (compareStartDate && compareEndDate) {
        if (isDateInRange(entry.date, compareStartDate, compareEndDate)) {
          current.compare.debit += line.debit;
          current.compare.credit += line.credit;
        }
      }

      totals.set(line.accountId, current);
    });
  });

  const rows = accounts
    .filter((account) => account.isPosting)
    .map((account) => {
      const summary = totals.get(account.id) ?? {
        opening: { debit: 0, credit: 0 },
        movement: { debit: 0, credit: 0 },
        compare: { debit: 0, credit: 0 },
      };
      const openingNet = summary.opening.debit - summary.opening.credit;
      const movementNet = summary.movement.debit - summary.movement.credit;
      const closingNet = openingNet + movementNet;
      const compareNet = summary.compare.debit - summary.compare.credit;
      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        openingDebit: openingNet >= 0 ? openingNet : 0,
        openingCredit: openingNet < 0 ? Math.abs(openingNet) : 0,
        movementDebit: summary.movement.debit,
        movementCredit: summary.movement.credit,
        closingDebit: closingNet >= 0 ? closingNet : 0,
        closingCredit: closingNet < 0 ? Math.abs(closingNet) : 0,
        compareDebit: compareNet >= 0 ? compareNet : 0,
        compareCredit: compareNet < 0 ? Math.abs(compareNet) : 0,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalsSummary = rows.reduce(
    (acc, row) => {
      acc.openingDebit += row.openingDebit;
      acc.openingCredit += row.openingCredit;
      acc.movementDebit += row.movementDebit;
      acc.movementCredit += row.movementCredit;
      acc.closingDebit += row.closingDebit;
      acc.closingCredit += row.closingCredit;
      acc.compareDebit += row.compareDebit;
      acc.compareCredit += row.compareCredit;
      return acc;
    },
    {
      openingDebit: 0,
      openingCredit: 0,
      movementDebit: 0,
      movementCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
      compareDebit: 0,
      compareCredit: 0,
    }
  );

  return NextResponse.json({
    rows,
    totals: totalsSummary,
    range: { startDate: startDate ?? null, endDate: endDate ?? null },
    compareRange:
      compareStartDate && compareEndDate
        ? { startDate: compareStartDate, endDate: compareEndDate }
        : null,
  });
}

