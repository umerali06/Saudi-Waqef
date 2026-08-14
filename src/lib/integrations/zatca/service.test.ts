import { describe, expect, it, vi } from "vitest";
import { mapSalesInvoiceToZatca } from "@/lib/integrations/zatca/service";

vi.mock("@/lib/data/integrations", () => ({
  updateIntegration: vi.fn(),
  updateIntegrationZatcaChainInTransaction: vi.fn(),
}));
vi.mock("@/lib/integrations/zatca/submission-lock", () => ({
  acquireZatcaSubmissionLock: vi.fn().mockResolvedValue("run-1"),
  releaseZatcaSubmissionLock: vi.fn(),
}));
vi.mock("@/lib/data/companies", () => ({
  getCompanyById: vi.fn().mockResolvedValue({
    id: "company-1", name: "Seller", legalName: "Seller LLC", currency: "SAR",
    vatNumber: "300000000000003", crNumber: "1010000000", address: "King Road", createdAt: new Date(),
  }),
}));
vi.mock("@/lib/data/customers", () => ({
  getCustomerById: vi.fn().mockResolvedValue({
    id: "customer-1", name: "Buyer", legalName: "Buyer LLC", vatNumber: "310000000000003",
    billingAddress: "Buyer Road", createdAt: new Date(),
  }),
}));
vi.mock("@/lib/data/sales-invoices", () => ({ listSalesInvoices: vi.fn() }));
vi.mock("@/lib/data/credit-notes", () => ({ listSalesCreditNotes: vi.fn() }));
vi.mock("@/lib/data/zatca-artifacts", () => ({
  createZatcaArtifact: vi.fn(), getZatcaArtifactByInvoiceId: vi.fn(), updateZatcaArtifactStatus: vi.fn(),
}));

describe("ZATCA invoice mapping", () => {
  it("maps a VAT-registered buyer to a standard clearance invoice", async () => {
    const document = await mapSalesInvoiceToZatca({
      integration: {
        id: "integration-1", companyId: "company-1", name: "ZATCA", connector: "zatca",
        status: "active", environment: "sandbox", createdAt: new Date(),
        config: { mapping: { sellerNameAr: "البائع", sellerAddress: {
          street: "King Road", building: "1234", district: "Olaya", city: "Riyadh", postalCode: "12211", countryCode: "SA",
        } } },
      },
      invoice: {
        id: "invoice-1", companyId: "company-1", customerId: "customer-1", customerName: "Buyer",
        customerVatNumber: "310000000000003", invoiceNumber: "INV-1", status: "approved",
        invoiceDate: "2026-06-20", dueDate: "2026-07-20", currency: "SAR", subtotal: 100,
        discountTotal: 0, taxTotal: 15, total: 115, amountPaid: 0, amountCredited: 0, balance: 115,
        createdAt: new Date("2026-06-20T10:00:00Z"), lines: [{
          id: "line-1", description: "Service", quantity: 1, unit: "C62", unitPrice: 100,
          discountRate: 0, discountAmount: 0, taxCategoryId: "S", taxRate: 15,
          taxAmount: 15, netAmount: 100, totalAmount: 115, baseQuantity: 1,
        }],
      },
      chain: { lastHash: "previous", lastUuid: "old", counter: 4, updatedAt: new Date().toISOString() },
    });

    expect(document.profileId).toBe("clearance:1.0");
    expect(document.invoiceTypeCodeName).toBe("0100000");
    expect(document.invoiceCounter).toBe(5);
    expect(document.previousInvoiceHash).toBe("previous");
    expect(document.supplier.address.postalCode).toBe("12211");
    expect(document.taxSubtotals).toEqual([{ taxableAmount: 100, taxAmount: 15, percent: 15, taxCategoryId: "S" }]);
  });
});
