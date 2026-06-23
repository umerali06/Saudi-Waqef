import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import {
  buildBalanceSheetReport,
  buildCashFlowReport,
  buildProfitLossReport,
} from "@/lib/utils/financial-statements";

const isDateInRange = (date: string, startDate?: string | null, endDate?: string | null) => {
  if (startDate && date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
};

export async function buildExternalTrialBalance(params: {
  companyId: string;
  startDate?: string | null;
  endDate?: string | null;
  compareStartDate?: string | null;
  compareEndDate?: string | null;
}) {
  const [accounts, entries] = await Promise.all([
    listChartAccounts(params.companyId),
    listJournalEntries(params.companyId),
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

      if (params.startDate && entry.date < params.startDate) {
        current.opening.debit += line.debit;
        current.opening.credit += line.credit;
      } else if (isDateInRange(entry.date, params.startDate, params.endDate)) {
        current.movement.debit += line.debit;
        current.movement.credit += line.credit;
      }

      if (
        params.compareStartDate &&
        params.compareEndDate &&
        isDateInRange(entry.date, params.compareStartDate, params.compareEndDate)
      ) {
        current.compare.debit += line.debit;
        current.compare.credit += line.credit;
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

  return {
    rows,
    totals: totalsSummary,
    range: { startDate: params.startDate ?? null, endDate: params.endDate ?? null },
    compareRange:
      params.compareStartDate && params.compareEndDate
        ? { startDate: params.compareStartDate, endDate: params.compareEndDate }
        : null,
  };
}

export async function buildExternalProfitLoss(params: {
  companyId: string;
  startDate?: string | null;
  endDate?: string | null;
  compareStartDate?: string | null;
  compareEndDate?: string | null;
}) {
  const [accounts, entries] = await Promise.all([
    listChartAccounts(params.companyId),
    listJournalEntries(params.companyId),
  ]);

  return buildProfitLossReport({
    accounts,
    entries,
    startDate: params.startDate ?? null,
    endDate: params.endDate ?? null,
    compareStartDate: params.compareStartDate ?? null,
    compareEndDate: params.compareEndDate ?? null,
  });
}

export async function buildExternalBalanceSheet(params: {
  companyId: string;
  asOfDate: string;
}) {
  const [accounts, entries] = await Promise.all([
    listChartAccounts(params.companyId),
    listJournalEntries(params.companyId),
  ]);

  return buildBalanceSheetReport({
    accounts,
    entries,
    asOfDate: params.asOfDate,
  });
}

export async function buildExternalCashFlow(params: {
  companyId: string;
  startDate: string;
  endDate: string;
}) {
  const [accounts, entries, cashAccounts] = await Promise.all([
    listChartAccounts(params.companyId),
    listJournalEntries(params.companyId),
    listCashBankAccounts(params.companyId),
  ]);

  return buildCashFlowReport({
    accounts,
    entries,
    cashAccounts: cashAccounts.map((account) => ({
      accountId: account.accountId,
      name: account.name,
      openingBalance: account.openingBalance,
    })),
    startDate: params.startDate,
    endDate: params.endDate,
  });
}
