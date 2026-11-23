import { describe, expect, it } from "vitest";
import {
  calculateLineAmounts,
  clampNumber,
  resolveNoteTaxRate,
  resolveTaxRate,
  roundLineAmounts,
  roundMoney,
  sumLineAmounts,
} from "@/lib/utils/invoice";

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

describe("money rounding", () => {
  it("rounds half away from zero at 2 decimals", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(38.3295)).toBe(38.33);
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
    expect(roundMoney(Number.NaN)).toBe(0);
  });

  it("keeps net + tax equal to total on every line", () => {
    for (const taxInclusive of [true, false]) {
      for (const unitPrice of [0.01, 0.07, 1.005, 33.33, 99.99, 1234.565]) {
        for (const quantity of [1, 3, 7, 0.333]) {
          for (const discountRate of [0, 7.5, 33.33, 100]) {
            const line = calculateLineAmounts({
              quantity,
              unitPrice,
              discountRate,
              taxRate: 0.15,
              taxInclusive,
            });
            expect(roundMoney(line.netAmount + line.taxAmount)).toBe(line.totalAmount);
            expect(line.netAmount).toBe(roundMoney(line.netAmount));
            expect(line.taxAmount).toBe(roundMoney(line.taxAmount));
          }
        }
      }
    }
  });

  it("makes document totals add up", () => {
    const lines = [1, 2, 3].map(() =>
      calculateLineAmounts({
        quantity: 1,
        unitPrice: 33.33,
        discountRate: 0,
        taxRate: 0.15,
        taxInclusive: false,
      })
    );
    const totals = sumLineAmounts(lines);
    expect(totals).toEqual({ subtotal: 99.99, discountTotal: 0, taxTotal: 15, total: 114.99 });
  });

  it("rounds lines saved at full precision", () => {
    expect(
      roundLineAmounts([
        { netAmount: 33.33, taxAmount: 4.9995, totalAmount: 38.3295, discountAmount: 0 },
      ])
    ).toEqual([{ netAmount: 33.33, taxAmount: 5, totalAmount: 38.33, discountAmount: 0 }]);
  });
});

describe("tax rates", () => {
  it("is zero when the company has VAT turned off", () => {
    expect(resolveTaxRate({ rate: 15 }, true)).toBe(0.15);
    expect(resolveTaxRate({ rate: 15 }, false)).toBe(0);
    expect(resolveTaxRate(null, true)).toBe(0);
  });

  it("credits at the rate the original line was charged", () => {
    const original = { taxRate: 0.05, taxCategoryId: "vat" };
    const category = { rate: 15 };
    expect(
      resolveNoteTaxRate({ original, taxCategoryId: "vat", category, vatEnabled: false })
    ).toBe(0.05);
    expect(
      resolveNoteTaxRate({ original, taxCategoryId: "other", category, vatEnabled: true })
    ).toBe(0.15);
  });
});
