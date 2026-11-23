import { describe, expect, it } from "vitest";
import {
  buildBalanceSheetReport,
  buildCashFlowReport,
  CURRENT_EARNINGS_ID,
  OPENING_BALANCE_SOURCE,
} from "@/lib/utils/financial-statements";

const account = (id: string, type: "asset" | "liability" | "equity" | "income" | "expense") => ({
  id,
  code: id,
  name: id,
  type,
  isPosting: true,
});
const accounts = [
  account("cash", "asset"),
  account("capital", "equity"),
  account("sales", "income"),
  account("rent", "expense"),
];
const entry = (
  date: string,
  debit: string,
  credit: string,
  amount: number,
  sourceType = "manual"
) => ({
  date,
  status: "posted" as const,
  sourceType,
  lines: [
    { accountId: debit, debit: amount, credit: 0 },
    { accountId: credit, debit: 0, credit: amount },
  ],
});
const entries = [
  entry("2026-01-01", "cash", "capital", 1000, OPENING_BALANCE_SOURCE),
  entry("2026-01-10", "cash", "sales", 500),
  entry("2026-01-15", "rent", "cash", 200),
];

describe("buildBalanceSheetReport", () => {
  it("balances by carrying earnings in equity", () => {
    const report = buildBalanceSheetReport({ accounts, entries, asOfDate: "2026-01-31" });
    expect(report.totals.assets).toBe(1300);
    expect(report.difference).toBe(0);
    expect(
      report.equity.accounts.find((row) => row.accountId === CURRENT_EARNINGS_ID)?.amount
    ).toBe(300);
  });
});

describe("buildCashFlowReport", () => {
  const params = { accounts, startDate: "2026-01-01", endDate: "2026-01-31" };
  const cashAccounts = [{ accountId: "cash", name: "Cash", openingBalance: 700 }];

  it("takes opening cash from the posted opening entry", () => {
    const report = buildCashFlowReport({ ...params, entries, cashAccounts });
    expect(report.openingCash).toBe(1000);
    expect(report.netCashChange).toBe(300);
    expect(report.otherChange).toBe(0);
  });

  it("uses the cash account's own opening balance until one is posted", () => {
    const report = buildCashFlowReport({ ...params, entries: entries.slice(1), cashAccounts });
    expect(report.openingCash).toBe(700);
    expect(report.closingCash).toBe(1000);
  });
});
