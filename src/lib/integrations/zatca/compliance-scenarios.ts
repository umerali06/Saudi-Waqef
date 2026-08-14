import crypto from "crypto";
import {
  extractCertificateSignature,
  generateInvoiceXml,
  signComplianceInvoice,
  signInvoice,
  type CustomerInfo,
  type InvoiceData,
  type SupplierInfo,
  type ZatcaComplianceCheckType,
} from "@talha7k/zatca";

/**
 * ZATCA's mandatory compliance test batch. The 6 native ids are built and
 * signed entirely by the @talha7k/zatca package (no real invoice needed —
 * see `signComplianceInvoice`). The 5 custom ids exercise "special case"
 * document shapes the package doesn't ship a canned builder for.
 */
export type CustomScenarioId =
  | "STANDARD_INVOICE_LINE_DISCOUNT"
  | "STANDARD_INVOICE_HEADER_CHARGE"
  | "STANDARD_INVOICE_MULTI_TAX_CATEGORY"
  | "STANDARD_INVOICE_EXEMPT_LINE"
  | "STANDARD_INVOICE_RETURN_LINE";

export type ComplianceScenarioId = ZatcaComplianceCheckType | CustomScenarioId;

const NATIVE_SCENARIOS: ZatcaComplianceCheckType[] = [
  "STANDARD_INVOICE",
  "STANDARD_CREDIT_NOTE",
  "STANDARD_DEBIT_NOTE",
  "SIMPLIFIED_INVOICE",
  "SIMPLIFIED_CREDIT_NOTE",
  "SIMPLIFIED_DEBIT_NOTE",
];

const CUSTOM_SCENARIOS: CustomScenarioId[] = [
  "STANDARD_INVOICE_LINE_DISCOUNT",
  "STANDARD_INVOICE_HEADER_CHARGE",
  "STANDARD_INVOICE_MULTI_TAX_CATEGORY",
  "STANDARD_INVOICE_EXEMPT_LINE",
  "STANDARD_INVOICE_RETURN_LINE",
];

export const COMPLIANCE_SCENARIOS: ComplianceScenarioId[] = [
  ...NATIVE_SCENARIOS,
  ...CUSTOM_SCENARIOS,
];

/**
 * Gates onboarding pass/fail. Excludes STANDARD_INVOICE_RETURN_LINE: a plain
 * invoice with a negative-quantity return line is a deliberately unusual
 * document that ZATCA may legitimately reject (returns should go through
 * credit notes) — it is still run and reported, just never blocks onboarding.
 */
export const GATING_SCENARIOS: ComplianceScenarioId[] = COMPLIANCE_SCENARIOS.filter(
  (id) => id !== "STANDARD_INVOICE_RETURN_LINE"
);

export type ComplianceScenarioResult = {
  scenarioId: ComplianceScenarioId;
  signedXml: string;
  invoiceHash: string;
  uuid: string;
};

export type ComplianceScenarioContext = {
  supplier: SupplierInfo;
  customer?: CustomerInfo;
  privateKeyPem: string;
  certificatePem: string;
};

function defaultComplianceCustomer(): CustomerInfo {
  return {
    name: "Compliance Test Customer",
    vatNumber: "300000000000003",
    address: {
      street: "Test Street",
      building: "1234",
      district: "Test District",
      city: "Riyadh",
      postalCode: "12211",
      countryCode: "SA",
    },
  };
}

function baseCustomInvoice(ctx: ComplianceScenarioContext, invoiceNumber: string) {
  const now = new Date();
  return {
    invoiceNumber,
    uuid: crypto.randomUUID(),
    issueDate: now.toISOString().slice(0, 10),
    issueTime: now.toISOString().slice(11, 19),
    invoiceTypeCode: "388" as const,
    invoiceTypeCodeName: "0100000" as const,
    profileId: "clearance:1.0" as const,
    currencyCode: "SAR",
    supplier: ctx.supplier,
    customer: ctx.customer ?? defaultComplianceCustomer(),
  };
}

function buildLineDiscountScenario(ctx: ComplianceScenarioContext): InvoiceData {
  const base = baseCustomInvoice(ctx, "COMP-DISC-001");
  const gross = 200; // qty 2 x 100
  const discount = 20;
  const net = gross - discount;
  const tax = Math.round(net * 15) / 100;
  return {
    ...base,
    lineExtensionAmount: net,
    taxExclusiveAmount: net,
    taxInclusiveAmount: net + tax,
    payableAmount: net + tax,
    taxAmount: tax,
    allowanceTotalAmount: discount,
    taxSubtotals: [{ taxableAmount: net, taxAmount: tax, percent: 15, taxCategoryId: "S" }],
    invoiceLines: [
      {
        id: 1,
        quantity: 2,
        unitCode: "C62",
        lineExtensionAmount: net,
        taxAmount: tax,
        itemName: "Compliance Line Discount Item",
        taxCategoryId: "S",
        taxPercent: 15,
        priceAmount: 100,
        allowanceCharges: [
          {
            chargeIndicator: false,
            reason: "Volume discount",
            amount: discount,
            taxCategoryId: "S",
            taxPercent: 15,
          },
        ],
      },
    ],
  };
}

function buildHeaderChargeScenario(ctx: ComplianceScenarioContext): InvoiceData {
  const base = baseCustomInvoice(ctx, "COMP-CHRG-001");
  const lineNet = 500;
  const lineTax = Math.round(lineNet * 15) / 100;
  const charge = 50;
  const chargeTax = Math.round(charge * 15) / 100;
  const taxExclusive = lineNet + charge;
  const totalTax = lineTax + chargeTax;
  return {
    ...base,
    lineExtensionAmount: lineNet,
    taxExclusiveAmount: taxExclusive,
    taxInclusiveAmount: taxExclusive + totalTax,
    payableAmount: taxExclusive + totalTax,
    taxAmount: totalTax,
    allowanceCharges: [
      { chargeIndicator: true, reason: "Delivery Fee", amount: charge, taxCategoryId: "S", taxPercent: 15 },
    ],
    taxSubtotals: [{ taxableAmount: taxExclusive, taxAmount: totalTax, percent: 15, taxCategoryId: "S" }],
    invoiceLines: [
      {
        id: 1,
        quantity: 1,
        unitCode: "C62",
        lineExtensionAmount: lineNet,
        taxAmount: lineTax,
        itemName: "Compliance Header Charge Item",
        taxCategoryId: "S",
        taxPercent: 15,
        priceAmount: lineNet,
      },
    ],
  };
}

function buildMultiTaxCategoryScenario(ctx: ComplianceScenarioContext): InvoiceData {
  const base = baseCustomInvoice(ctx, "COMP-MULTI-001");
  const standardNet = 300;
  const standardTax = Math.round(standardNet * 15) / 100;
  const zeroNet = 200;
  return {
    ...base,
    lineExtensionAmount: standardNet + zeroNet,
    taxExclusiveAmount: standardNet + zeroNet,
    taxInclusiveAmount: standardNet + zeroNet + standardTax,
    payableAmount: standardNet + zeroNet + standardTax,
    taxAmount: standardTax,
    taxSubtotals: [
      { taxableAmount: standardNet, taxAmount: standardTax, percent: 15, taxCategoryId: "S" },
      { taxableAmount: zeroNet, taxAmount: 0, percent: 0, taxCategoryId: "Z" },
    ],
    invoiceLines: [
      {
        id: 1,
        quantity: 1,
        unitCode: "C62",
        lineExtensionAmount: standardNet,
        taxAmount: standardTax,
        itemName: "Compliance Standard-Rated Item",
        taxCategoryId: "S",
        taxPercent: 15,
        priceAmount: standardNet,
      },
      {
        id: 2,
        quantity: 1,
        unitCode: "C62",
        lineExtensionAmount: zeroNet,
        taxAmount: 0,
        itemName: "Compliance Zero-Rated Item",
        taxCategoryId: "Z",
        taxPercent: 0,
        priceAmount: zeroNet,
      },
    ],
  };
}

function buildExemptLineScenario(ctx: ComplianceScenarioContext): InvoiceData {
  const base = baseCustomInvoice(ctx, "COMP-EXEMPT-001");
  const net = 100;
  return {
    ...base,
    lineExtensionAmount: net,
    taxExclusiveAmount: net,
    taxInclusiveAmount: net,
    payableAmount: net,
    taxAmount: 0,
    taxSubtotals: [{ taxableAmount: net, taxAmount: 0, percent: 0, taxCategoryId: "E" }],
    invoiceLines: [
      {
        id: 1,
        quantity: 1,
        unitCode: "C62",
        lineExtensionAmount: net,
        taxAmount: 0,
        itemName: "Compliance Exempt Item",
        taxCategoryId: "E",
        taxPercent: 0,
        priceAmount: net,
      },
    ],
  };
}

function buildReturnLineScenario(ctx: ComplianceScenarioContext): InvoiceData {
  const base = baseCustomInvoice(ctx, "COMP-RETURN-001");
  const net = -50;
  const tax = -7.5;
  return {
    ...base,
    lineExtensionAmount: net,
    taxExclusiveAmount: net,
    taxInclusiveAmount: net + tax,
    payableAmount: net + tax,
    taxAmount: tax,
    taxSubtotals: [{ taxableAmount: net, taxAmount: tax, percent: 15, taxCategoryId: "S" }],
    invoiceLines: [
      {
        id: 1,
        quantity: -1,
        unitCode: "C62",
        lineExtensionAmount: net,
        taxAmount: tax,
        itemName: "Compliance Return Item",
        taxCategoryId: "S",
        taxPercent: 15,
        priceAmount: 50,
      },
    ],
  };
}

function buildCustomScenarioDocument(id: CustomScenarioId, ctx: ComplianceScenarioContext): InvoiceData {
  switch (id) {
    case "STANDARD_INVOICE_LINE_DISCOUNT":
      return buildLineDiscountScenario(ctx);
    case "STANDARD_INVOICE_HEADER_CHARGE":
      return buildHeaderChargeScenario(ctx);
    case "STANDARD_INVOICE_MULTI_TAX_CATEGORY":
      return buildMultiTaxCategoryScenario(ctx);
    case "STANDARD_INVOICE_EXEMPT_LINE":
      return buildExemptLineScenario(ctx);
    case "STANDARD_INVOICE_RETURN_LINE":
      return buildReturnLineScenario(ctx);
  }
}

function isNativeScenario(id: ComplianceScenarioId): id is ZatcaComplianceCheckType {
  return (NATIVE_SCENARIOS as string[]).includes(id);
}

export function buildAndSignComplianceScenario(
  id: ComplianceScenarioId,
  ctx: ComplianceScenarioContext
): ComplianceScenarioResult {
  if (isNativeScenario(id)) {
    const result = signComplianceInvoice({
      checkType: id,
      supplier: ctx.supplier,
      customer: ctx.customer,
      privateKeyPem: ctx.privateKeyPem,
      certificatePem: ctx.certificatePem,
    });
    return {
      scenarioId: id,
      signedXml: result.signedXml,
      invoiceHash: result.invoiceHash,
      uuid: result.uuid,
    };
  }

  const document = buildCustomScenarioDocument(id, ctx);
  const xml = generateInvoiceXml(document);
  const signed = signInvoice({
    xml,
    privateKeyPem: ctx.privateKeyPem,
    certificatePem: ctx.certificatePem,
    qrData: {
      sellerName: document.supplier.nameEn,
      vatNumber: document.supplier.vatNumber,
      timestamp: `${document.issueDate}T${document.issueTime}Z`,
      totalWithVat: document.taxInclusiveAmount.toFixed(2),
      vatTotal: document.taxAmount.toFixed(2),
      certificateSignature: extractCertificateSignature(ctx.certificatePem),
    },
  });
  return {
    scenarioId: id,
    signedXml: signed.signedXml,
    invoiceHash: signed.invoiceHash,
    uuid: document.uuid,
  };
}
