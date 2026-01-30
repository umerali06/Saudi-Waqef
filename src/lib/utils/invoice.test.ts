import { describe, expect, it } from "vitest";
import { calculateLineAmounts, clampNumber } from "@/lib/utils/invoice";

describe("calculateLineAmounts", () => {
  it("calculates tax-exclusive totals with discount", () => {
    const result = calculateLineAmounts({
      quantity: 2,
      unitPrice: 100,
      discountRate: 10,
      taxRate: 0.15,
      taxInclusive: false,
    });

    expect(result.discountAmount).toBeCloseTo(20, 4);
    expect(result.netAmount).toBeCloseTo(180, 4);
    expect(result.taxAmount).toBeCloseTo(27, 4);
    expect(result.totalAmount).toBeCloseTo(207, 4);
  });

  it("calculates tax-inclusive totals", () => {
    const result = calculateLineAmounts({
      quantity: 1,
      unitPrice: 115,
      discountRate: 0,
      taxRate: 0.15,
      taxInclusive: true,
    });

    expect(result.totalAmount).toBeCloseTo(115, 4);
    expect(result.netAmount).toBeCloseTo(100, 4);
    expect(result.taxAmount).toBeCloseTo(15, 4);
  });
});

describe("clampNumber", () => {
  it("clamps non-finite values", () => {
    expect(clampNumber(Number.NaN)).toBe(0);
    expect(clampNumber(Number.POSITIVE_INFINITY, 5)).toBe(5);
  });

  it("clamps to min", () => {
    expect(clampNumber(-10, 2)).toBe(2);
    expect(clampNumber(4, 2)).toBe(4);
  });
});
