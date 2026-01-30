import { describe, expect, it } from "vitest";
import { getUnitOptions, toBaseQuantity, toDisplayQuantity } from "@/lib/utils/units";

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
