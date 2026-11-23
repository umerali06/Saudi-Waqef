import { describe, expect, it } from "vitest";
import type { CompanyRecord } from "@/lib/data/companies";
import type { CustomerRecord } from "@/lib/data/customers";
import type { IntegrationRecord } from "@/lib/data/integrations";
import type { TaxCategory } from "@/lib/data/tax-categories";
import { interpretComplianceReply, interpretSubmissionReply } from "@/lib/integrations/zatca/api";
import {
  INITIAL_PREVIOUS_HASH,
  buildZatcaXml,
  calculateZatcaTotals,
} from "@/lib/integrations/zatca/document";
import { complianceScenariosFor } from "@/lib/integrations/zatca/compliance-scenarios";
import { zatcaBaseUrl, withoutServerManagedConfig } from "@/lib/integrations/zatca/environment";
import { buildZatcaDocument, type ZatcaSourceDocument } from "@/lib/integrations/zatca/mapping";
import { resolveIssueTime, riyadhDateTime } from "@/lib/integrations/zatca/time";
import { calculateLineAmounts } from "@/lib/utils/invoice";

const company: CompanyRecord = {
  id: "company-1", name: "Seller", legalName: "Seller LLC", currency: "SAR",
  vatNumber: "300000000000003", crNumber: "1010000000", createdAt: new Date(),
};
const integration: IntegrationRecord = {
  id: "integration-1", companyId: "company-1", name: "ZATCA", connector: "zatca",
  status: "active", environment: "sandbox", createdAt: new Date(),
  config: { mapping: { sellerNameAr: "البائع", sellerAddress: {
    street: "King Road", building: "١٢٣٤", district: "Olaya", city: "Riyadh", postalCode: "12211",
  } } },
};
const customer = {
  id: "customer-1", companyId: "company-1", name: "Buyer", legalName: "Buyer LLC",
  vatNumber: "310000000000003", billingAddress: "Buyer Road",
  billingAddressDetails: {
    street: "Buyer Road", building: "4321", district: "Al Malaz", city: "Riyadh",
    postalCode: "11564", countryCode: "SA",
  },
  createdAt: new Date(),
} as unknown as CustomerRecord;
const category = (over: Partial<TaxCategory>): TaxCategory => ({
  id: "std", companyId: "company-1", name: "Standard", rate: 15, type: "standard",
  status: "active", createdAt: new Date(), ...over,
});

const line = (over: { quantity?: number; unitPrice?: number; discountRate?: number; taxRate?: number; taxInclusive?: boolean; taxCategoryId?: string } = {}) => {
  const input = { quantity: 1, unitPrice: 100, discountRate: 0, taxRate: 0.15, taxInclusive: false, ...over };
  return {
    id: "line-1", description: "Service", unit: "unit", baseQuantity: input.quantity,
    quantity: input.quantity, unitPrice: input.unitPrice, discountRate: input.discountRate,
    taxCategoryId: over.taxCategoryId ?? "std", taxRate: input.taxRate,
    ...calculateLineAmounts(input),
  };
};
const source = (lines: ReturnType<typeof line>[], over: Partial<ZatcaSourceDocument> = {}): ZatcaSourceDocument => ({
  id: "invoice-1", companyId: "company-1", invoiceNumber: "INV-1", invoiceDate: "2026-06-20",
  currency: "SAR", customerName: "Buyer", lines,
  total: lines.reduce((sum, item) => sum + item.totalAmount, 0), ...over,
});
const build = (over: Partial<Parameters<typeof buildZatcaDocument>[0]> = {}) =>
  buildZatcaDocument({
    integration, company, customer, taxCategories: [category({})], chain: null,
    source: source([line()]), ...over,
  });

describe("ZATCA document mapping", () => {
  it("files 15% VAT as 15 percentage points, not as the stored 0.15 fraction", () => {
    const xml = buildZatcaXml(build());
    expect(xml).toContain("<cbc:Percent>15.00</cbc:Percent>");
    expect(xml).not.toContain("<cbc:Percent>0.15</cbc:Percent>");
    expect(xml).toContain('<cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>');
  });

  it("uses the profile, counter and first-document hash ZATCA mandates", () => {
    const xml = buildZatcaXml(build());
    expect(xml).toContain("<cbc:ProfileID>reporting:1.0</cbc:ProfileID>");
    expect(xml).toContain("<cbc:ID>ICV</cbc:ID><cbc:UUID>1</cbc:UUID>");
    expect(xml).toContain(INITIAL_PREVIOUS_HASH);
    expect(xml).toContain("<cbc:ActualDeliveryDate>2026-06-20</cbc:ActualDeliveryDate>");
  });

  it("continues an existing hash chain", () => {
    const document = build({ chain: { lastHash: "previous", lastUuid: "u", counter: 4, updatedAt: "" } });
    expect(document.counter).toBe(5);
    expect(document.previousHash).toBe("previous");
  });

  it("treats VAT-registered buyers as standard and others as simplified", () => {
    expect(build().simplified).toBe(false);
    expect(build({ customer: null }).simplified).toBe(true);
    expect(buildZatcaXml(build())).toContain('name="0100000"');
    expect(buildZatcaXml(build({ customer: null }))).toContain('name="0200000"');
  });

  it("normalises Arabic-Indic digits in addresses", () => {
    expect(build().supplier.address.building).toBe("1234");
  });

  it("puts discounts on the line once and keeps the totals consistent", () => {
    const totals = calculateZatcaTotals(build({ source: source([line({ quantity: 2, discountRate: 10 })]) }));
    expect(totals).toMatchObject({ net: 180, vat: 27, gross: 207, payable: 207, rounding: 0 });
  });

  it("restates VAT-inclusive prices net of VAT", () => {
    const totals = calculateZatcaTotals(
      build({ source: source([line({ unitPrice: 115, taxInclusive: true })]) })
    );
    expect(totals).toMatchObject({ net: 100, vat: 15, gross: 115 });
  });

  it("absorbs halala differences but refuses a real mismatch with the books", () => {
    const odd = source([line({ quantity: 3, unitPrice: 33.33 })]);
    expect(Math.abs(calculateZatcaTotals(build({ source: odd })).rounding)).toBeLessThanOrEqual(0.01);
    expect(() => calculateZatcaTotals(build({ source: { ...odd, total: 999 } }))).toThrow(/ZATCA_TOTAL_MISMATCH/);
  });

  it("requires a VATEX reason on 0% lines and files it", () => {
    const zero = source([line({ taxRate: 0, taxCategoryId: "zero" })]);
    const withReason = category({ id: "zero", name: "Export", rate: 0, type: "zero", exemptionReasonCode: "VATEX-SA-32" });
    const xml = buildZatcaXml(build({ source: zero, taxCategories: [withReason] }));
    expect(xml).toContain("<cbc:TaxExemptionReasonCode>VATEX-SA-32</cbc:TaxExemptionReasonCode>");
    expect(xml).toContain("<cbc:ID>Z</cbc:ID>");
    expect(() =>
      build({ source: zero, taxCategories: [{ ...withReason, exemptionReasonCode: null }] })
    ).toThrow(/ZATCA_TAX_REASON_MISSING:Export/);
  });

  it("references the original invoice on debit notes and uses type 383", () => {
    const xml = buildZatcaXml(
      build({ note: { kind: "debit", reason: "Price correction", originalInvoiceNumber: "INV-1" } })
    );
    expect(xml).toMatch(/<cbc:InvoiceTypeCode name="0100000">383</);
    expect(xml).toContain("<cac:InvoiceDocumentReference><cbc:ID>INV-1</cbc:ID>");
    expect(xml).toContain("<cbc:InstructionNote>Price correction</cbc:InstructionNote>");
  });

  it("refuses an incomplete buyer address and a foreign currency", () => {
    expect(() => build({ customer: { ...customer, billingAddressDetails: null } as CustomerRecord })).toThrow(
      /ZATCA_BUYER_ADDRESS_INCOMPLETE/
    );
    expect(() => build({ source: source([line()], { currency: "USD" }) })).toThrow(/ZATCA_CURRENCY_UNSUPPORTED/);
  });

  it("escapes markup in user text", () => {
    const xml = buildZatcaXml(build({ source: source([{ ...line(), description: "A & B <c>" }]) }));
    expect(xml).toContain("A &amp; B &lt;c&gt;");
  });
});

describe("ZATCA replies", () => {
  it("never reads an unexplained 2xx or a 401 as acceptance", () => {
    expect(interpretSubmissionReply("reporting", { status: 200, json: {}, text: "{}" }).accepted).toBe(false);
    expect(interpretComplianceReply({ status: 401, json: { message: "Unauthorized" }, text: "" }).valid).toBe(false);
    expect(interpretComplianceReply({ status: 200, json: {}, text: "{}" }).valid).toBe(false);
  });

  it("accepts explicit verdicts and documents ZATCA already holds", () => {
    expect(interpretSubmissionReply("reporting", { status: 202, json: { reportingStatus: "REPORTED" }, text: "" }).accepted).toBe(true);
    expect(interpretSubmissionReply("clearance", { status: 200, json: { clearanceStatus: "CLEARED", clearedInvoice: "eA==" }, text: "" }).clearedInvoice).toBe("eA==");
    expect(interpretSubmissionReply("reporting", { status: 409, json: null, text: "" }).accepted).toBe(true);
    expect(interpretSubmissionReply("clearance", { status: 400, json: { clearanceStatus: "NOT_CLEARED" }, text: "" }).accepted).toBe(false);
  });
});

describe("ZATCA settings", () => {
  it("targets the gateway paths that exist", () => {
    expect(zatcaBaseUrl("production")).toMatch(/\/e-invoicing\/core$/);
    expect(zatcaBaseUrl("simulation")).toMatch(/\/e-invoicing\/simulation$/);
  });

  it("runs only the checks the CSR invoice type covers", () => {
    expect(complianceScenariosFor("1000").every((id) => id.startsWith("STANDARD"))).toBe(true);
    expect(complianceScenariosFor("0100").every((id) => id.startsWith("SIMPLIFIED"))).toBe(true);
    expect(complianceScenariosFor("1100")).toHaveLength(9);
  });

  it("keeps the hash chain out of reach of settings forms", () => {
    expect(withoutServerManagedConfig({ zatcaHashChain: {}, onboardingStatus: "x", sellerNameAr: "a" })).toEqual({ sellerNameAr: "a" });
  });

  it("issues documents in Riyadh time", () => {
    expect(riyadhDateTime(new Date("2026-06-20T22:30:00Z"))).toEqual({ date: "2026-06-21", time: "01:30:00" });
    expect(resolveIssueTime("2026-06-20", "2026-06-20T10:00:00Z")).toBe("13:00:00");
    expect(resolveIssueTime("2026-06-19", "2026-06-20T10:00:00Z")).toBe("12:00:00");
  });
});
