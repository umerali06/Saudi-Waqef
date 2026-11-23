/** Pure calculations behind the dashboard. No I/O, so they can be tested directly. */

export type MonthPoint = { month: string; revenue: number; expenses: number };

export type AgingBucket = "current" | "d30" | "d60" | "d90" | "older";
export const AGING_BUCKETS: AgingBucket[] = ["current", "d30", "d60", "d90", "older"];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const monthsEndingAt = (endDate: string, count: number) => {
  const [year, month] = endDate.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
};

/** Monthly revenue and expenses, both excluding VAT. Credit amounts are passed as negatives. */
export const buildMonthlyTrend = (
  months: string[],
  revenue: Array<{ date: string; amount: number }>,
  expenses: Array<{ date: string; amount: number }>
): MonthPoint[] => {
  const sumBy = (rows: Array<{ date: string; amount: number }>) => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = row.date.slice(0, 7);
      totals.set(key, (totals.get(key) ?? 0) + row.amount);
    }
    return totals;
  };
  const revenueByMonth = sumBy(revenue);
  const expensesByMonth = sumBy(expenses);
  return months.map((month) => ({
    month,
    revenue: round2(revenueByMonth.get(month) ?? 0),
    expenses: round2(expensesByMonth.get(month) ?? 0),
  }));
};

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const agingBucketOf = (dueDate: string, today: string): AgingBucket => {
  const overdue = daysBetween(dueDate, today);
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "d30";
  if (overdue <= 60) return "d60";
  if (overdue <= 90) return "d90";
  return "older";
};

export const buildAging = (rows: Array<{ dueDate: string; balance: number }>, today: string) => {
  const totals: Record<AgingBucket, number> = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  for (const row of rows) {
    if (row.balance > 0) totals[agingBucketOf(row.dueDate, today)] += row.balance;
  }
  for (const bucket of AGING_BUCKETS) totals[bucket] = round2(totals[bucket]);
  return { buckets: totals, total: round2(AGING_BUCKETS.reduce((sum, key) => sum + totals[key], 0)) };
};

/** VAT returns are due on the last day of the month after the tax period ends. */
export const vatReturnDueDate = (periodEnd: string) => {
  const [year, month] = periodEnd.split("-").map(Number);
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
};

/** The unfiled period the user should act on: the oldest one ended, else the one running today. */
export const pickVatPeriod = <T extends { startDate: string; endDate: string; status: string }>(
  periods: T[],
  today: string
): T | null => {
  const open = periods
    .filter((period) => period.status === "open")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    open.find((period) => period.endDate < today) ??
    open.find((period) => period.startDate <= today && period.endDate >= today) ??
    null
  );
};

/** A clean axis maximum (1, 2, 2.5, 5 x 10^n) at or above the data. */
export const niceAxisMax = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
};
