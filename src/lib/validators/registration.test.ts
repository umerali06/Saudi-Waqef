import { describe, expect, it } from "vitest";
import {
  cleanCompanyName,
  isValidCompanyName,
  normalizeSaudiMobile,
  registrationErrorFields,
  registrationSchema,
} from "@/lib/validators/registration";

const base = {
  kind: "new",
  name: "أحمد محمد",
  email: "ahmad@example.sa",
  companyName: "شركة الرياض",
  phone: "0512345678",
  locale: "ar",
};

const errorsOf = (payload: unknown) => {
  const parsed = registrationSchema.safeParse(payload);
  return parsed.success ? [] : registrationErrorFields(parsed.error);
};

describe("company name", () => {
  it("refuses stray keystrokes and keeps real names", () => {
    expect(isValidCompanyName(cleanCompanyName(";f;f;"))).toBe(false);
    expect(isValidCompanyName(cleanCompanyName("--a-b--"))).toBe(false);
    expect(isValidCompanyName(cleanCompanyName("..."))).toBe(false);
    expect(isValidCompanyName(cleanCompanyName("STC"))).toBe(true);
    expect(isValidCompanyName(cleanCompanyName("مؤسسة نور"))).toBe(true);
    expect(cleanCompanyName(" ; Riyadh  Trading Co. ; ")).toBe("Riyadh Trading Co.");
    expect(cleanCompanyName("شركة الرياض (المتحدة)")).toBe("شركة الرياض (المتحدة)");
  });
});

describe("normalizeSaudiMobile", () => {
  it("accepts the usual spellings, Arabic digits included", () => {
    for (const value of [
      "0512345678",
      "512345678",
      "+966512345678",
      "966 51 234 5678",
      "00966512345678",
      "٠٥١٢٣٤٥٦٧٨",
      "+٩٦٦٥١٢٣٤٥٦٧٨",
    ]) {
      expect(normalizeSaudiMobile(value)).toBe("+966512345678");
    }
  });

  it("refuses landlines and other countries", () => {
    expect(normalizeSaudiMobile("0112345678")).toBeNull();
    expect(normalizeSaudiMobile("+201012345678")).toBeNull();
    expect(normalizeSaudiMobile("05123")).toBeNull();
  });
});

describe("registrationSchema", () => {
  it("normalises a new-company request", () => {
    const parsed = registrationSchema.parse({
      ...base,
      crNumber: "١٠١٠١٢٣٤٥٦",
      vatNumber: "310123456700003",
    });
    expect(parsed).toMatchObject({
      kind: "new",
      phone: "+966512345678",
      crNumber: "1010123456",
      vatNumber: "310123456700003",
    });
    expect(registrationSchema.parse({ ...base, crNumber: "" })).toMatchObject({
      crNumber: null,
      vatNumber: null,
    });
  });

  it("names the fields that are wrong", () => {
    expect(
      errorsOf({ ...base, companyName: ";f;f;", phone: "1", crNumber: "12", vatNumber: "400000000000003" }).sort()
    ).toEqual(["companyName", "crNumber", "phone", "vatNumber"]);
    expect(errorsOf({ ...base, email: "x" })).toEqual(["email"]);
  });

  it("never lets a join request ask for ownership", () => {
    const join = { ...base, kind: "join", requestedRole: "accountant" };
    expect(errorsOf(join)).toEqual([]);
    expect(errorsOf({ ...join, requestedRole: "owner" })).toEqual(["requestedRole"]);
  });
});
