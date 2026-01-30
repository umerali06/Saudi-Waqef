import { describe, expect, it } from "vitest";
import { customerSchema, vendorSchema } from "@/lib/validators/parties";

describe("party VAT validation", () => {
  const validVat = "300000000000003";

  it("accepts valid VAT for customers", () => {
    const result = customerSchema.safeParse({
      companyId: "c1",
      name: "Acme",
      vatRegistered: true,
      vatNumber: validVat,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid VAT when registered", () => {
    const result = customerSchema.safeParse({
      companyId: "c1",
      name: "Acme",
      vatRegistered: true,
      vatNumber: "123",
    });

    expect(result.success).toBe(false);
  });

  it("allows missing VAT when not registered", () => {
    const result = vendorSchema.safeParse({
      companyId: "c1",
      name: "Vendor",
      vatRegistered: false,
      vatNumber: null,
    });

    expect(result.success).toBe(true);
  });
});
