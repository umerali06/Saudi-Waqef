import { roundMoney } from "@/lib/utils/invoice";

export type StatementEntry = {
  date: string;
  /** Message key of the document type. */
  typeKey: string;
  number: string;
  debit: number;
  credit: number;
};

export type StatementLine = StatementEntry & { balance: number };

export type Statement = {
  openingBalance: number;
  lines: StatementLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
};

/**
 * Account of one party over a period. The balance is what the party owes us
 * (customer) or what we owe the party (vendor), so it grows with debits for a
 * customer and with credits for a vendor.
 */
export function buildStatement(
  entries: StatementEntry[],
  period: { from: string; to: string },
  side: "customer" | "vendor"
): Statement {
  const signed = (entry: StatementEntry) =>
    side === "customer" ? entry.debit - entry.credit : entry.credit - entry.debit;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const openingBalance = roundMoney(
    sorted
      .filter((entry) => entry.date < period.from)
      .reduce((sum, entry) => sum + signed(entry), 0)
  );
  let balance = openingBalance;
  const lines = sorted
    .filter((entry) => entry.date >= period.from && entry.date <= period.to)
    .map((entry) => {
      balance = roundMoney(balance + signed(entry));
      return { ...entry, balance };
    });

  return {
    openingBalance,
    lines,
    totalDebit: roundMoney(lines.reduce((sum, line) => sum + line.debit, 0)),
    totalCredit: roundMoney(lines.reduce((sum, line) => sum + line.credit, 0)),
    closingBalance: balance,
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Requested period, from the start of this year until today when not given. */
export function statementPeriod(
  from: unknown,
  to: unknown,
  today: string
): { from: string; to: string } {
  const end = typeof to === "string" && DATE.test(to) ? to : today;
  const start =
    typeof from === "string" && DATE.test(from) ? from : `${end.slice(0, 4)}-01-01`;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}
