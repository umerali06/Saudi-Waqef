import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildVatSummary } from "@/lib/utils/vat-report";

const listSalesInvoices = vi.fn();
const listPurchaseBills = vi.fn();
const listSalesCreditNotes = vi.fn();
const listVendorCreditNotes = vi.fn();
const listExpenses = vi.fn();
const listTaxCategories = vi.fn();
const listVatAdjustments = vi.fn();

vi.mock("@/lib/data/sales-invoices", () => ({ listSalesInvoices }));
vi.mock("@/lib/data/purchase-bills", () => ({ listPurchaseBills }));
vi.mock("@/lib/data/credit-notes", () => ({ listSalesCreditNotes }));
vi.mock("@/lib/data/vendor-credit-notes", () => ({ listVendorCreditNotes }));
vi.mock("@/lib/data/expenses", () => ({ listExpenses }));
vi.mock("@/lib/data/tax-categories", () => ({ listTaxCategories }));
vi.mock("@/lib/data/vat-adjustments", () => ({ listVatAdjustments }));

beforeEach(() => {
  listSalesInvoices.mockReset();
  listPurchaseBills.mockReset();
  listSalesCreditNotes.mockReset();
  listVendorCreditNotes.mockReset();
  listExpenses.mockReset();
  listTaxCategories.mockReset();
  listVatAdjustments.mockReset();
});

describe("buildVatSummary", () => {
  it("aggregates VAT across sales, purchases, credits, and adjustments", async () => {
    listTaxCategories.mockResolvedValue([
      { id: "tax15", rate: 15, type: "standard" },
      { id: "tax0", rate: 0, type: "zero" },
    ]);

    listSalesInvoices.mockResolvedValue([
      {
        id: "inv1",
        status: "approved",
        invoiceDate: "2026-01-05",
        lines: [
          {
            taxRate: 0.15,
            taxCategoryId: "tax15",
            netAmount: 100,
            taxAmount: 15,
          },
        ],
      },
      {
        id: "inv2",
        status: "draft",
        invoiceDate: "2026-01-05",
        lines: [],
      },
    ]);

    listSalesCreditNotes.mockResolvedValue([
      {
        id: "cr1",
        status: "issued",
        issueDate: "2026-01-10",
        lines: [
          {
            taxRate: 0.15,
            taxCategoryId: "tax15",
            netAmount: 40,
            taxAmount: 6,
          },
        ],
      },
    ]);

    listPurchaseBills.mockResolvedValue([
      {
        id: "bill1",
        status: "approved",
        billDate: "2026-01-08",
        lines: [
          {
            taxRate: 0.15,
            taxCategoryId: "tax15",
            netAmount: 50,
            taxAmount: 7.5,
          },
        ],
      },
    ]);

    listVendorCreditNotes.mockResolvedValue([
      {
        id: "vcr1",
        status: "issued",
        issueDate: "2026-01-12",
        lines: [
          {
            taxRate: 0.15,
            taxCategoryId: "tax15",
            netAmount: 10,
            taxAmount: 1.5,
          },
        ],
      },
    ]);

    listExpenses.mockResolvedValue([
      {
        id: "exp1",
        status: "approved",
        expenseDate: "2026-01-15",
        taxRate: 0.15,
        taxCategoryId: "tax15",
        netAmount: 20,
        taxAmount: 3,
      },
    ]);

    listVatAdjustments.mockResolvedValue([
      { id: "adj1", type: "output", amount: 2 },
      { id: "adj2", type: "input", amount: 1 },
    ]);

    const summary = await buildVatSummary({
      companyId: "co1",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      periodId: "p1",
    });

    expect(summary.sales.netAmount).toBeCloseTo(60, 2);
    expect(summary.sales.taxAmount).toBeCloseTo(9, 2);
    expect(summary.purchases.netAmount).toBeCloseTo(60, 2);
    expect(summary.purchases.taxAmount).toBeCloseTo(9, 2);
    expect(summary.outputVat).toBeCloseTo(11, 2);
    expect(summary.inputVat).toBeCloseTo(10, 2);
    expect(summary.netVat).toBeCloseTo(1, 2);
    expect(summary.breakdown.sales[0]).toMatchObject({
      rate: 15,
      type: "standard",
      taxableAmount: 60,
      taxAmount: 9,
    });
    expect(summary.breakdown.purchases[0]).toMatchObject({
      rate: 15,
      type: "standard",
      taxableAmount: 60,
      taxAmount: 9,
    });
  });
});
