import { describe, expect, it } from "vitest";
import {
  agingBucketOf,
  buildAging,
  buildMonthlyTrend,
  monthsEndingAt,
  niceAxisMax,
  pickVatPeriod,
  vatReturnDueDate,
} from "@/lib/reports/dashboard-metrics";

describe("dashboard metrics", () => {
  it("lists months across a year boundary", () => {
    expect(monthsEndingAt("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("nets credit notes into their month and ignores other months", () => {
    expect(
      buildMonthlyTrend(
        ["2026-01", "2026-02"],
        [
          { date: "2026-01-05", amount: 100 },
          { date: "2026-01-20", amount: -30 },
          { date: "2025-12-31", amount: 999 },
        ],
        [{ date: "2026-02-01", amount: 40.005 }]
      )
    ).toEqual([
      { month: "2026-01", revenue: 70, expenses: 0 },
      { month: "2026-02", revenue: 0, expenses: 40.01 },
    ]);
  });

  it("places balances at the bucket boundaries", () => {
    const today = "2026-06-30";
    expect(agingBucketOf("2026-06-30", today)).toBe("current");
    expect(agingBucketOf("2026-06-29", today)).toBe("d30");
    expect(agingBucketOf("2026-05-31", today)).toBe("d30");
    expect(agingBucketOf("2026-05-30", today)).toBe("d60");
    expect(agingBucketOf("2026-04-01", today)).toBe("d90");
    expect(agingBucketOf("2026-03-31", today)).toBe("older");
    expect(
      buildAging([{ dueDate: "2026-06-01", balance: 10 }, { dueDate: "2026-06-01", balance: 0 }], today)
    ).toEqual({ buckets: { current: 0, d30: 10, d60: 0, d90: 0, older: 0 }, total: 10 });
  });

  it("derives the VAT filing deadline", () => {
    expect(vatReturnDueDate("2026-03-31")).toBe("2026-04-30");
    expect(vatReturnDueDate("2026-12-31")).toBe("2027-01-31");
    expect(vatReturnDueDate("2028-01-31")).toBe("2028-02-29");
  });

  it("prefers the oldest ended unfiled VAT period", () => {
    const period = (startDate: string, endDate: string, status = "open") => ({ startDate, endDate, status });
    const q1 = period("2026-01-01", "2026-03-31", "filed");
    const q2 = period("2026-04-01", "2026-06-30");
    const q3 = period("2026-07-01", "2026-09-30");
    expect(pickVatPeriod([q3, q2, q1], "2026-08-01")).toBe(q2);
    expect(pickVatPeriod([q3, q1], "2026-08-01")).toBe(q3);
    expect(pickVatPeriod([q1], "2026-08-01")).toBeNull();
  });

  it("rounds axis maxima up to clean steps", () => {
    expect([0, 9, 11, 2300, 5000].map(niceAxisMax)).toEqual([100, 10, 20, 2500, 5000]);
  });
});
