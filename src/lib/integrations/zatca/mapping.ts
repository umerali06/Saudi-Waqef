import { v5 as uuidv5 } from "uuid";
import type { CompanyRecord } from "@/lib/data/companies";
import type { CustomerRecord } from "@/lib/data/customers";
import type { IntegrationRecord } from "@/lib/data/integrations";
import type { InvoiceLine, SalesInvoice } from "@/lib/data/sales-invoices";
import type { TaxCategory } from "@/lib/data/tax-categories";
import {
  buildZatcaCustomerAddress,
  buildZatcaSupplierInfo,
} from "@/lib/integrations/zatca/company-info";
import {
  INITIAL_PREVIOUS_HASH,
  round2,
  type ZatcaDocument,
  type ZatcaHashChain,
  type ZatcaLine,
} from "@/lib/integrations/zatca/document";
import { findExemption } from "@/lib/integrations/zatca/exemptions";
import { resolveIssueTime } from "@/lib/integrations/zatca/time";

const UUID_NAMESPACE = "f1c74ab4-9968-48f5-a919-6f6f01d93086";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Stable per document so a retry is recognised by ZATCA as the same document. */
export const zatcaDocumentUuid = (companyId: string, documentId: string) =>
  uuidv5(`${companyId}:${documentId}`, UUID_NAMESPACE);

/** Integration settings, with the wizard's nested `mapping` block applied on top. */
export const mergedZatcaConfig = (integration: IntegrationRecord): Record<string, unknown> => {
  const root = integration.config ?? {};
  return root.mapping && typeof root.mapping === "object" && !Array.isArray(root.mapping)
    ? { ...root, ...(root.mapping as Record<string, unknown>) }
    : root;
};

// UN/ECE Recommendation 20 codes for the unit names used on items.
const UNIT_CODES: Record<string, string> = {
  unit: "PCE", piece: "PCE", pieces: "PCE", pcs: "PCE", pc: "PCE", each: "EA", ea: "EA",
  "قطعة": "PCE", "وحدة": "PCE", "حبة": "PCE",
  service: "E48", "خدمة": "E48",
  hour: "HUR", hours: "HUR", hr: "HUR", "ساعة": "HUR",
  day: "DAY", days: "DAY", "يوم": "DAY",
  month: "MON", months: "MON", "شهر": "MON",
  year: "ANN", "سنة": "ANN",
  kg: "KGM", kilogram: "KGM", "كيلو": "KGM", "كجم": "KGM",
  g: "GRM", gram: "GRM", ton: "TNE", tonne: "TNE", "طن": "TNE",
  l: "LTR", liter: "LTR", litre: "LTR", "لتر": "LTR",
  m: "MTR", meter: "MTR", metre: "MTR", "متر": "MTR",
  m2: "MTK", sqm: "MTK", m3: "MTQ",
  box: "BX", "صندوق": "BX", carton: "CT", "كرتون": "CT", pack: "PK", "عبوة": "PK",
  dozen: "DZN", "درزن": "DZN", set: "SET", "طقم": "SET",
};

const unitCode = (unit: string) => {
  const key = unit.trim().toLowerCase();
  return UNIT_CODES[key] ?? (/^[A-Z0-9]{2,3}$/.test(unit.trim()) ? unit.trim() : "PCE");
};

export const mapLine = (
  line: InvoiceLine,
  index: number,
  taxCategories: Map<string, TaxCategory>
): ZatcaLine => {
  // Lines store the rate as a fraction (0.15); ZATCA expects percentage points.
  const taxPercent = round2(line.taxRate * 100);
  const category = line.taxCategoryId ? taxCategories.get(line.taxCategoryId) : undefined;

  // When prices include VAT the stored unit price and discount are gross, so
  // both are restated net of VAT from the line's own net amount.
  const grossBeforeDiscount = line.unitPrice * line.quantity;
  const afterDiscount = grossBeforeDiscount - line.discountAmount;
  const netFactor = afterDiscount > 0 ? line.netAmount / afterDiscount : 1;
  const base = {
    id: index + 1,
    name: line.description,
    quantity: line.quantity,
    unitCode: unitCode(line.unit || "unit"),
    unitPrice: line.unitPrice * netFactor,
    discount: round2(line.discountAmount * netFactor),
    taxPercent,
  };
  if (taxPercent > 0) return { ...base, taxCategory: "S" };

  if (!category) throw new Error(`ZATCA_TAX_CATEGORY_MISSING:${line.description}`);
  const exemption = findExemption(category.exemptionReasonCode);
  if (!exemption) throw new Error(`ZATCA_TAX_REASON_MISSING:${category.name}`);
  return {
    ...base,
    taxCategory: exemption.category,
    exemptionCode: exemption.code,
    exemptionReason: exemption.reasonEn,
  };
};

export type ZatcaSourceDocument = Pick<
  SalesInvoice,
  "id" | "companyId" | "invoiceNumber" | "invoiceDate" | "currency" | "total" | "lines"
> & {
  approvedAt?: string | null;
  customerName: string;
  customerVatNumber?: string;
  billingAddress?: string;
};

export function buildZatcaDocument(params: {
  integration: IntegrationRecord;
  company: CompanyRecord;
  customer: CustomerRecord | null;
  taxCategories: TaxCategory[];
  source: ZatcaSourceDocument;
  chain: ZatcaHashChain | null;
  note?: { kind: "credit" | "debit"; reason: string; originalInvoiceNumber: string };
}): ZatcaDocument {
  const { integration, company, customer, source, chain, note } = params;
  const config = mergedZatcaConfig(integration);
  if ((source.currency || "SAR") !== "SAR") {
    throw new Error(`ZATCA_CURRENCY_UNSUPPORTED:${source.currency}`);
  }
  const customerVat = text(customer?.vatNumber) || text(source.customerVatNumber);
  const taxCategories = new Map(params.taxCategories.map((item) => [item.id, item]));

  return {
    kind: note?.kind ?? "invoice",
    simplified: !customerVat,
    invoiceNumber: source.invoiceNumber,
    uuid: zatcaDocumentUuid(source.companyId, source.id),
    issueDate: source.invoiceDate,
    issueTime: resolveIssueTime(source.invoiceDate, source.approvedAt),
    supplyDate: source.invoiceDate,
    counter: (chain?.counter ?? 0) + 1,
    previousHash: chain?.lastHash || INITIAL_PREVIOUS_HASH,
    supplier: buildZatcaSupplierInfo(company, config),
    customer: customerVat
      ? {
          name: customer?.legalName || customer?.name || source.customerName,
          vatNumber: customerVat,
          address: buildZatcaCustomerAddress(
            customer?.billingAddressDetails,
            customer?.billingAddress || source.billingAddress,
            config.customerAddress
          ),
        }
      : undefined,
    reason: note?.reason,
    originalInvoiceNumber: note?.originalInvoiceNumber,
    lines: source.lines.map((line, index) => mapLine(line, index, taxCategories)),
    payableAmount: source.total,
  };
}
