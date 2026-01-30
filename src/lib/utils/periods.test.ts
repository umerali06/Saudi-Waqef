import { describe, expect, it } from "vitest";
import {
  buildMonthlyPeriods,
  buildQuarterlyPeriods,
  isDateWithinRange,
  periodsOverlap,
} from "@/lib/utils/periods";

describe("period helpers", () => {
  it("builds monthly periods", () => {
    const periods = buildMonthlyPeriods(2025);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toMatchObject({
      name: "2025-01",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });
    expect(periods[11]).toMatchObject({
      name: "2025-12",
      startDate: "2025-12-01",
      endDate: "2025-12-31",
    });
  });

  it("builds quarterly periods", () => {
    const periods = buildQuarterlyPeriods(2024);
    expect(periods).toHaveLength(4);
    expect(periods[0]).toMatchObject({
      name: "2024-Q1",
      startDate: "2024-01-01",
      endDate: "2024-03-31",
    });
    expect(periods[3]).toMatchObject({
      name: "2024-Q4",
      startDate: "2024-10-01",
      endDate: "2024-12-31",
    });
  });

  it("checks date range inclusion", () => {
    expect(isDateWithinRange("2025-02-15", "2025-02-01", "2025-02-28")).toBe(
      true
    );
    expect(isDateWithinRange("2025-03-01", "2025-02-01", "2025-02-28")).toBe(
      false
    );
  });

  it("detects overlapping periods", () => {
    expect(periodsOverlap("2025-01-01", "2025-01-31", "2025-01-15", "2025-02-05")).toBe(
      true
    );
    expect(periodsOverlap("2025-01-01", "2025-01-31", "2025-02-01", "2025-02-28")).toBe(
      false
    );
  });
});
