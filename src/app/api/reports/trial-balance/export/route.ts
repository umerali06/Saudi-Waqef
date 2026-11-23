import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";
import { trialBalanceModel } from "@/lib/pdf/financial-reports";
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
        label: `${account.code} - ${account.name}`,
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
    .sort((a, b) => a.label.localeCompare(b.label));

  const includeCompare = Boolean(compareStartDate && compareEndDate);

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "trial-balance",
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
    const pdf = await renderReport(
      trialBalanceModel(context, { rows, startDate, endDate, includeCompare })
    );
    return pdfResponse(pdf, "trial-balance.pdf", request);
  }

  const headers = includeCompare
    ? [
        "Account",
        "OpeningDebit",
        "OpeningCredit",
        "MovementDebit",
        "MovementCredit",
        "ClosingDebit",
        "ClosingCredit",
        "CompareDebit",
        "CompareCredit",
      ]
    : [
        "Account",
        "OpeningDebit",
        "OpeningCredit",
        "MovementDebit",
        "MovementCredit",
        "ClosingDebit",
        "ClosingCredit",
      ];

  const csvRows = rows.map((row) => {
    const base = [
      row.label,
      row.openingDebit.toFixed(2),
      row.openingCredit.toFixed(2),
      row.movementDebit.toFixed(2),
      row.movementCredit.toFixed(2),
      row.closingDebit.toFixed(2),
      row.closingCredit.toFixed(2),
    ];
    if (!includeCompare) {
      return base;
    }
    return [...base, row.compareDebit.toFixed(2), row.compareCredit.toFixed(2)];
  });

  const csv = toCsv(headers, csvRows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"trial-balance.csv\"",
    },
  });
}

