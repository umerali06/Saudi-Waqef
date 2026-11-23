import { describe, expect, it } from "vitest";
import { findStatementMatch } from "@/lib/utils/reconciliation";

const movement = (id: string, date: string, amount: number, direction: "in" | "out") => ({
  id,
  date,
  amount,
  direction,
});

describe("findStatementMatch", () => {
  const movements = [
    movement("far", "2026-01-01", 100, "in"),
    movement("near", "2026-01-09", 100, "in"),
    movement("out", "2026-01-10", 100, "out"),
  ];

  it("picks the nearest movement of the same amount and direction", () => {
    expect(findStatementMatch({ date: "2026-01-10", amount: 100 }, movements)?.id).toBe("near");
    expect(findStatementMatch({ date: "2026-01-11", amount: -100 }, movements)?.id).toBe("out");
  });

  it("ignores movements more than three days away", () => {
    expect(findStatementMatch({ date: "2026-01-20", amount: 100 }, movements)).toBeNull();
  });
});
