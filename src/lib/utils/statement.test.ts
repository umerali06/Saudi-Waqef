import { describe, expect, it } from "vitest";
import { buildStatement, statementPeriod, type StatementEntry } from "@/lib/utils/statement";

const entry = (date: string, debit: number, credit: number): StatementEntry => ({
  date,
  typeKey: "type",
  number: date,
  debit,
  credit,
});
const period = { from: "2026-02-01", to: "2026-02-28" };

describe("buildStatement", () => {
  it("carries earlier movements into the opening balance and ignores later ones", () => {
    const statement = buildStatement(
      [
        entry("2026-03-01", 50, 0),
        entry("2026-02-10", 0, 400),
        entry("2026-02-05", 1150, 0),
        entry("2026-01-20", 300, 100),
      ],
      period,
      "customer"
    );
    expect(statement.openingBalance).toBe(200);
    expect(statement.lines.map((line) => line.balance)).toEqual([1350, 950]);
    expect(statement).toMatchObject({
      totalDebit: 1150,
      totalCredit: 400,
      closingBalance: 950,
    });
  });

  it("grows with credits for a vendor", () => {
    const statement = buildStatement(
      [entry("2026-02-05", 0, 1150), entry("2026-02-10", 150, 0)],
      period,
      "vendor"
    );
    expect(statement.closingBalance).toBe(1000);
  });

  it("closes at the opening balance when nothing moved", () => {
    expect(buildStatement([], period, "customer")).toMatchObject({
      openingBalance: 0,
      closingBalance: 0,
      lines: [],
    });
  });
});

describe("statementPeriod", () => {
  it("defaults to this year and orders the dates", () => {
    expect(statementPeriod(null, undefined, "2026-05-10")).toEqual({
      from: "2026-01-01",
      to: "2026-05-10",
    });
    expect(statementPeriod("2026-03-01", "2026-02-01", "2026-05-10")).toEqual({
      from: "2026-02-01",
      to: "2026-03-01",
    });
    expect(statementPeriod("bad", "2025-06-30", "2026-05-10")).toEqual({
      from: "2025-01-01",
      to: "2025-06-30",
    });
  });
});
