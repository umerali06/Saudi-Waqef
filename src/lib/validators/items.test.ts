import { describe, expect, it } from "vitest";
import { itemErrorCode, itemSchema, NUMERIC_UNIT } from "@/lib/validators/items";

const item = { companyId: "c", type: "product", name: "Paper", baseUnit: "piece" };

describe("itemSchema units", () => {
  it("accepts named units", () => {
    expect(itemSchema.safeParse(item).success).toBe(true);
    expect(
      itemSchema.safeParse({ ...item, packUnit: "box", packSize: 10 }).success
    ).toBe(true);
  });

  it.each(["1", "١٢", " 10 "])("rejects the numeric unit %s", (baseUnit) => {
    const result = itemSchema.safeParse({ ...item, baseUnit });
    expect(result.success).toBe(false);
    expect(result.error && itemErrorCode(result.error)).toBe(NUMERIC_UNIT);
  });

  it("keeps the general error for other problems", () => {
    const result = itemSchema.safeParse({ ...item, name: "" });
    expect(result.error && itemErrorCode(result.error)).toBe("Invalid payload");
  });
});
