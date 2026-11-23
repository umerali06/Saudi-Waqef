import crypto from "crypto";
import {
  INITIAL_PREVIOUS_HASH,
  signZatcaDocument,
  type SignedZatcaDocument,
  type ZatcaDocument,
  type ZatcaLine,
  type ZatcaParty,
  type ZatcaSupplier,
} from "@/lib/integrations/zatca/document";
import { riyadhDateTime } from "@/lib/integrations/zatca/time";

/**
 * The documents ZATCA requires before it issues a production CSID, plus the
 * special shapes this product actually produces. They go through the same
 * builder and signer as real invoices, so passing them proves the live path.
 */
export type ComplianceScenarioId =
  | "STANDARD_INVOICE"
  | "STANDARD_CREDIT_NOTE"
  | "STANDARD_DEBIT_NOTE"
  | "SIMPLIFIED_INVOICE"
  | "SIMPLIFIED_CREDIT_NOTE"
  | "SIMPLIFIED_DEBIT_NOTE"
  | "STANDARD_INVOICE_LINE_DISCOUNT"
  | "STANDARD_INVOICE_MULTI_TAX_CATEGORY"
  | "STANDARD_INVOICE_EXEMPT_LINE";

const STANDARD: ComplianceScenarioId[] = [
  "STANDARD_INVOICE",
  "STANDARD_CREDIT_NOTE",
  "STANDARD_DEBIT_NOTE",
  "STANDARD_INVOICE_LINE_DISCOUNT",
  "STANDARD_INVOICE_MULTI_TAX_CATEGORY",
  "STANDARD_INVOICE_EXEMPT_LINE",
];

const SIMPLIFIED: ComplianceScenarioId[] = [
  "SIMPLIFIED_INVOICE",
  "SIMPLIFIED_CREDIT_NOTE",
  "SIMPLIFIED_DEBIT_NOTE",
];

/**
 * The CSR's invoice type ("1100" = standard and simplified, "1000" = standard
 * only, "0100" = simplified only) decides which documents ZATCA accepts.
 */
export const complianceScenariosFor = (invoiceType: string): ComplianceScenarioId[] => [
  ...(invoiceType[0] === "1" ? STANDARD : []),
  ...(invoiceType[1] === "1" ? SIMPLIFIED : []),
];

const line = (overrides: Partial<ZatcaLine> = {}): ZatcaLine => ({
  id: 1,
  name: "Compliance item",
  quantity: 1,
  unitCode: "PCE",
  unitPrice: 100,
  discount: 0,
  taxCategory: "S",
  taxPercent: 15,
  ...overrides,
});

const scenarioLines = (id: ComplianceScenarioId): ZatcaLine[] => {
  if (id === "STANDARD_INVOICE_LINE_DISCOUNT") return [line({ quantity: 2, discount: 20 })];
  if (id === "STANDARD_INVOICE_MULTI_TAX_CATEGORY") {
    return [
      line({ unitPrice: 300 }),
      line({
        id: 2,
        unitPrice: 200,
        taxCategory: "Z",
        taxPercent: 0,
        exemptionCode: "VATEX-SA-32",
        exemptionReason: "Export of goods",
      }),
    ];
  }
  if (id === "STANDARD_INVOICE_EXEMPT_LINE") {
    return [
      line({
        taxCategory: "E",
        taxPercent: 0,
        exemptionCode: "VATEX-SA-30",
        exemptionReason: "Real estate transactions mentioned in Article 30 of the VAT Regulations",
      }),
    ];
  }
  return [line()];
};

const COMPLIANCE_CUSTOMER: ZatcaParty = {
  name: "عميل اختبار الامتثال",
  vatNumber: "399999999800003",
  address: {
    street: "طريق الملك فهد",
    building: "1234",
    district: "العليا",
    city: "الرياض",
    postalCode: "12211",
    countryCode: "SA",
  },
};

export function buildComplianceDocument(
  id: ComplianceScenarioId,
  supplier: ZatcaSupplier,
  now = new Date()
): ZatcaDocument {
  const simplified = id.startsWith("SIMPLIFIED");
  const kind = id.endsWith("CREDIT_NOTE") ? "credit" : id.endsWith("DEBIT_NOTE") ? "debit" : "invoice";
  const { date, time } = riyadhDateTime(now);
  return {
    kind,
    simplified,
    invoiceNumber: `COMP-${id}`,
    uuid: crypto.randomUUID(),
    issueDate: date,
    issueTime: time,
    supplyDate: date,
    counter: 1,
    previousHash: INITIAL_PREVIOUS_HASH,
    supplier,
    customer: simplified ? undefined : COMPLIANCE_CUSTOMER,
    ...(kind === "invoice"
      ? {}
      : {
          reason: "Compliance check",
          originalInvoiceNumber: `COMP-${simplified ? "SIMPLIFIED" : "STANDARD"}_INVOICE`,
        }),
    lines: scenarioLines(id),
  };
}

export function buildAndSignComplianceScenario(
  id: ComplianceScenarioId,
  params: { supplier: ZatcaSupplier; privateKeyPem: string; certificate: string }
): SignedZatcaDocument {
  return signZatcaDocument({
    document: buildComplianceDocument(id, params.supplier),
    privateKeyPem: params.privateKeyPem,
    certificate: params.certificate,
  });
}
