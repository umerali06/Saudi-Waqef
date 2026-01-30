import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { listVendorCreditNotes } from "@/lib/data/vendor-credit-notes";
import { listExpenses } from "@/lib/data/expenses";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { listVatAdjustments } from "@/lib/data/vat-adjustments";
import { isDateWithinRange } from "@/lib/utils/periods";

export type VatBreakdownEntry = {
  rate: number;
  type: "standard" | "zero" | "exempt" | "other";
  taxableAmount: number;
  taxAmount: number;
};

export type VatSummary = {
  startDate: string;
  endDate: string;
  sales: {
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
  };
  purchases: {
    netAmount: number;
    taxAmount: number;
    totalAmount: number;
  };
  adjustments: {
    output: number;
    input: number;
    net: number;
  };
  outputVat: number;
  inputVat: number;
  netVat: number;
  breakdown: {
    sales: VatBreakdownEntry[];
    purchases: VatBreakdownEntry[];
  };
};

const SALES_STATUSES = new Set([
  "approved",
  "sent",
  "partially_paid",
  "paid",
]);
const PURCHASE_STATUSES = new Set(["approved", "partially_paid", "paid"]);

const roundAmount = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const createKey = (rate: number, type: string) => `${rate}:${type}`;

const addBreakdownEntry = (
  map: Map<string, VatBreakdownEntry>,
  params: { rate: number; type: VatBreakdownEntry["type"]; net: number; tax: number }
) => {
  const key = createKey(params.rate, params.type);
  const existing = map.get(key);
  if (existing) {
    existing.taxableAmount += params.net;
    existing.taxAmount += params.tax;
    return;
  }
  map.set(key, {
    rate: params.rate,
    type: params.type,
    taxableAmount: params.net,
    taxAmount: params.tax,
  });
};

const finalizeBreakdown = (map: Map<string, VatBreakdownEntry>) =>
  Array.from(map.values())
    .map((entry) => ({
      ...entry,
      taxableAmount: roundAmount(entry.taxableAmount),
      taxAmount: roundAmount(entry.taxAmount),
    }))
    .sort((a, b) => a.rate - b.rate);

export async function buildVatSummary(params: {
  companyId: string;
  startDate: string;
  endDate: string;
  periodId?: string | null;
}): Promise<VatSummary> {
  const [invoices, bills, creditNotes, vendorCreditNotes, expenses, taxes, adjustments] =
    await Promise.all([
      listSalesInvoices(params.companyId),
      listPurchaseBills(params.companyId),
      listSalesCreditNotes(params.companyId),
      listVendorCreditNotes(params.companyId),
      listExpenses(params.companyId),
      listTaxCategories(params.companyId),
      params.periodId ? listVatAdjustments(params.companyId, params.periodId) : [],
    ]);

  const taxMap = new Map(taxes.map((tax) => [tax.id, tax]));
  const isInPeriod = (date: string) =>
    isDateWithinRange(date, params.startDate, params.endDate);

  const salesBreakdown = new Map<string, VatBreakdownEntry>();
  const purchaseBreakdown = new Map<string, VatBreakdownEntry>();

  let salesNet = 0;
  let salesTax = 0;
  let purchaseNet = 0;
  let purchaseTax = 0;

  invoices
    .filter((invoice) => SALES_STATUSES.has(invoice.status) && isInPeriod(invoice.invoiceDate))
    .forEach((invoice) => {
      invoice.lines.forEach((line) => {
        const rate = Number((line.taxRate * 100).toFixed(2));
        const taxCategory = line.taxCategoryId ? taxMap.get(line.taxCategoryId) : null;
        const type =
          taxCategory?.type ??
          (rate === 0 ? "zero" : "standard");
        addBreakdownEntry(salesBreakdown, {
          rate,
          type,
          net: line.netAmount,
          tax: line.taxAmount,
        });
        salesNet += line.netAmount;
        salesTax += line.taxAmount;
      });
    });

  creditNotes
    .filter((note) => note.status === "issued" && isInPeriod(note.issueDate))
    .forEach((note) => {
      note.lines.forEach((line) => {
        const rate = Number((line.taxRate * 100).toFixed(2));
        const taxCategory = line.taxCategoryId ? taxMap.get(line.taxCategoryId) : null;
        const type =
          taxCategory?.type ??
          (rate === 0 ? "zero" : "standard");
        addBreakdownEntry(salesBreakdown, {
          rate,
          type,
          net: -line.netAmount,
          tax: -line.taxAmount,
        });
        salesNet -= line.netAmount;
        salesTax -= line.taxAmount;
      });
    });

  bills
    .filter((bill) => PURCHASE_STATUSES.has(bill.status) && isInPeriod(bill.billDate))
    .forEach((bill) => {
      bill.lines.forEach((line) => {
        const rate = Number((line.taxRate * 100).toFixed(2));
        const taxCategory = line.taxCategoryId ? taxMap.get(line.taxCategoryId) : null;
        const type =
          taxCategory?.type ??
          (rate === 0 ? "zero" : "standard");
        addBreakdownEntry(purchaseBreakdown, {
          rate,
          type,
          net: line.netAmount,
          tax: line.taxAmount,
        });
        purchaseNet += line.netAmount;
        purchaseTax += line.taxAmount;
      });
    });

  vendorCreditNotes
    .filter((note) => note.status === "issued" && isInPeriod(note.issueDate))
    .forEach((note) => {
      note.lines.forEach((line) => {
        const rate = Number((line.taxRate * 100).toFixed(2));
        const taxCategory = line.taxCategoryId ? taxMap.get(line.taxCategoryId) : null;
        const type =
          taxCategory?.type ??
          (rate === 0 ? "zero" : "standard");
        addBreakdownEntry(purchaseBreakdown, {
          rate,
          type,
          net: -line.netAmount,
          tax: -line.taxAmount,
        });
        purchaseNet -= line.netAmount;
        purchaseTax -= line.taxAmount;
      });
    });

  expenses
    .filter((expense) => expense.status === "approved" && isInPeriod(expense.expenseDate))
    .forEach((expense) => {
      const rate = Number((expense.taxRate * 100).toFixed(2));
      const taxCategory = expense.taxCategoryId ? taxMap.get(expense.taxCategoryId) : null;
      const type =
        taxCategory?.type ??
        (rate === 0 ? "zero" : "standard");
      addBreakdownEntry(purchaseBreakdown, {
        rate,
        type,
        net: expense.netAmount,
        tax: expense.taxAmount,
      });
      purchaseNet += expense.netAmount;
      purchaseTax += expense.taxAmount;
    });

  const adjustmentOutput = adjustments
    .filter((adj) => adj.type === "output")
    .reduce((sum, adj) => sum + adj.amount, 0);
  const adjustmentInput = adjustments
    .filter((adj) => adj.type === "input")
    .reduce((sum, adj) => sum + adj.amount, 0);

  const outputVat = salesTax + adjustmentOutput;
  const inputVat = purchaseTax + adjustmentInput;

  return {
    startDate: params.startDate,
    endDate: params.endDate,
    sales: {
      netAmount: roundAmount(salesNet),
      taxAmount: roundAmount(salesTax),
      totalAmount: roundAmount(salesNet + salesTax),
    },
    purchases: {
      netAmount: roundAmount(purchaseNet),
      taxAmount: roundAmount(purchaseTax),
      totalAmount: roundAmount(purchaseNet + purchaseTax),
    },
    adjustments: {
      output: roundAmount(adjustmentOutput),
      input: roundAmount(adjustmentInput),
      net: roundAmount(adjustmentOutput - adjustmentInput),
    },
    outputVat: roundAmount(outputVat),
    inputVat: roundAmount(inputVat),
    netVat: roundAmount(outputVat - inputVat),
    breakdown: {
      sales: finalizeBreakdown(salesBreakdown),
      purchases: finalizeBreakdown(purchaseBreakdown),
    },
  };
}
