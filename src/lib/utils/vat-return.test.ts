import { describe, expect, it } from "vitest";
import { buildVatReturn } from "@/lib/utils/vat-return";
import type { VatSummary } from "@/lib/utils/vat-report";

const summary: VatSummary = {
  startDate: "2026-01-01",
  endDate: "2026-03-31",
  sales: { netAmount: 1900, taxAmount: 150, totalAmount: 2050 },
  purchases: { netAmount: 500, taxAmount: 60, totalAmount: 560 },
  adjustments: { output: 10, input: 4, net: 6 },
  outputVat: 160,
  inputVat: 64,
  netVat: 96,
  exports: 300,
  citizenServices: 100,
  breakdown: {
    sales: [
      { rate: 0, type: "zero", taxableAmount: 600, taxAmount: 0 },
      { rate: 0, type: "exempt", taxableAmount: 300, taxAmount: 0 },
      { rate: 15, type: "standard", taxableAmount: 1000, taxAmount: 150 },
    ],
    purchases: [
      { rate: 15, type: "standard", taxableAmount: 400, taxAmount: 60 },
      { rate: 0, type: "exempt", taxableAmount: 100, taxAmount: 0 },
    ],
  },
};

describe("buildVatReturn", () => {
  it("fills each box once and keeps the totals of the summary", () => {
    const report = buildVatReturn(summary);
    expect(report.sales.map((box) => box.amount)).toEqual([1000, 100, 200, 300, 300, 1900]);
    expect(report.purchases.map((box) => box.amount)).toEqual([400, null, null, 0, 100, 500]);
    expect(report.totals.map((box) => box.vat)).toEqual([90, 6, null, 96]);
    const lines = report.sales.filter((box) => !box.isTotal);
    expect(lines.reduce((sum, box) => sum + (box.amount ?? 0), 0)).toBe(1900);
  });

  it("puts every zero-rated sale in box 3 for returns filed before exports were split", () => {
    const report = buildVatReturn({ ...summary, exports: undefined, citizenServices: undefined });
    expect(report.sales[2].amount).toBe(600);
    expect(report.sales[3].amount).toBe(0);
  });
});
