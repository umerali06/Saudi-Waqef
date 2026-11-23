import { describe, expect, it } from "vitest";
import {
  getUnitOptions,
  toBaseQuantity,
  toDisplayQuantity,
  formatQuantity,
  isNumericUnit,
  printableUnit,
} from "@/lib/utils/units";

describe("units utils", () => {
  it("returns base and pack options", () => {
    const options = getUnitOptions({ baseUnit: "pcs", packUnit: "box", packSize: 12 });
    expect(options).toEqual([
      { unit: "pcs", ratio: 1 },
      { unit: "box", ratio: 12 },
    ]);
  });

  it("converts to base quantity", () => {
    expect(toBaseQuantity(2, "box", { baseUnit: "pcs", packUnit: "box", packSize: 10 })).toBe(
      20
    );
    expect(toBaseQuantity(5, "pcs", { baseUnit: "pcs" })).toBe(5);
  });

  it("converts to display quantity", () => {
    expect(
      toDisplayQuantity(24, "box", { baseUnit: "pcs", packUnit: "box", packSize: 12 })
    ).toBe(2);
    expect(toDisplayQuantity(8, "pcs", { baseUnit: "pcs" })).toBe(8);
  });
});

describe("printable units", () => {
  it("drops units made only of digits", () => {
    expect(isNumericUnit("1")).toBe(true);
    expect(isNumericUnit("٢")).toBe(true);
    expect(isNumericUnit("m2")).toBe(false);
    expect(printableUnit(" حبة ")).toBe("حبة");
    expect(formatQuantity(2, "1")).toBe("2");
    expect(formatQuantity(2, "box")).toBe("2 box");
  });
});

