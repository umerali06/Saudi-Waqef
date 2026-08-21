import { describe, expect, it } from "vitest";
import { classifyZatcaFailure } from "@/lib/integrations/zatca/error-messages";

describe("classifyZatcaFailure", () => {
  it("classifies and preserves missing seller-address fields", () => {
    expect(classifyZatcaFailure({ error: "ZATCA_SELLER_ADDRESS_INCOMPLETE:building,district,postalCode" })).toEqual({
      bucket: "seller_address_incomplete",
      messageKey: "integrations.zatca.errors.sellerAddressIncomplete",
      fields: ["building", "district", "postalCode"],
    });
  });

  it("classifies missing company information case-insensitively", () => {
    expect(classifyZatcaFailure("zatca_company_information_incomplete:legalName,vatNumber")).toEqual({
      bucket: "company_info_incomplete",
      messageKey: "integrations.zatca.errors.companyInfoIncomplete",
      fields: ["legalName", "vatNumber"],
    });
  });
});
