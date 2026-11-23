import { signInvoice } from "@/lib/integrations/zatca/signature";

/** SHA-256 of "0", hex, base64: the PIH ZATCA mandates for the first document of a chain. */
export const INITIAL_PREVIOUS_HASH =
  "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

export type ZatcaHashChain = {
  lastHash: string;
  lastUuid: string;
  counter: number;
  updatedAt: string;
};

export type ZatcaTaxCategory = "S" | "Z" | "E" | "O";

export type ZatcaAddress = {
  street: string;
  building: string;
  district: string;
  city: string;
  postalCode: string;
  countryCode: string;
};

export type ZatcaParty = {
  name: string;
  vatNumber?: string;
  crNumber?: string;
  address?: ZatcaAddress;
};

export type ZatcaSupplier = ZatcaParty & { vatNumber: string; address: ZatcaAddress };

export type ZatcaLine = {
  id: number;
  name: string;
  quantity: number;
  unitCode: string;
  /** Net unit price, before discount and excluding VAT. */
  unitPrice: number;
  /** Net discount on the whole line, excluding VAT. */
  discount: number;
  taxCategory: ZatcaTaxCategory;
  /** Percentage points: 15 means 15%. */
  taxPercent: number;
  exemptionCode?: string;
  exemptionReason?: string;
};

export type ZatcaDocument = {
  kind: "invoice" | "credit" | "debit";
  simplified: boolean;
  invoiceNumber: string;
  uuid: string;
  issueDate: string;
  issueTime: string;
  supplyDate: string;
  counter: number;
  previousHash: string;
  supplier: ZatcaSupplier;
  customer?: ZatcaParty;
  /** Required on credit/debit notes. */
  reason?: string;
  originalInvoiceNumber?: string;
  lines: ZatcaLine[];
  /** What the books say the buyer owes; halala differences go to PayableRoundingAmount. */
  payableAmount?: number;
};

export type ZatcaTotals = {
  lines: Array<ZatcaLine & { net: number; vat: number }>;
  groups: Array<{
    taxCategory: ZatcaTaxCategory;
    taxPercent: number;
    exemptionCode?: string;
    exemptionReason?: string;
    taxable: number;
    vat: number;
  }>;
  net: number;
  vat: number;
  gross: number;
  rounding: number;
  payable: number;
};

const CURRENCY = "SAR";
const INVOICE_TYPE_CODE = { invoice: "388", credit: "381", debit: "383" } as const;

export const round2 = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
};

const money = (value: number) => round2(value).toFixed(2);

/** Unit prices and quantities keep up to six decimals so price x quantity reproduces the line total. */
const decimal = (value: number) => Number(value.toFixed(6)).toString();

// Control characters are illegal in XML 1.0 and make ZATCA reject the whole file.
const ILLEGAL_XML_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");

const escapeXml = (value: string) =>
  value
    .replace(ILLEGAL_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .trim();

/**
 * Totals are recomputed from the lines, never copied from the stored invoice:
 * ZATCA verifies every sum (BR-CO-10, BR-CO-13, BR-CO-15, BR-S-09) to the halala.
 */
export const calculateZatcaTotals = (document: ZatcaDocument): ZatcaTotals => {
  const lines = document.lines.map((line) => {
    const net = round2(line.unitPrice * line.quantity - line.discount);
    return { ...line, net, vat: round2((net * line.taxPercent) / 100) };
  });
  const groups = new Map<string, ZatcaTotals["groups"][number]>();
  for (const line of lines) {
    const key = `${line.taxCategory}:${line.taxPercent}:${line.exemptionCode ?? ""}`;
    const group = groups.get(key) ?? {
      taxCategory: line.taxCategory,
      taxPercent: line.taxPercent,
      exemptionCode: line.exemptionCode,
      exemptionReason: line.exemptionReason,
      taxable: 0,
      vat: 0,
    };
    group.taxable = round2(group.taxable + line.net);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.vat = round2((group.taxable * group.taxPercent) / 100);
  }
  const net = round2(lines.reduce((sum, line) => sum + line.net, 0));
  const vat = round2([...groups.values()].reduce((sum, group) => sum + group.vat, 0));
  const gross = round2(net + vat);
  const payable = document.payableAmount === undefined ? gross : round2(document.payableAmount);
  const rounding = round2(payable - gross);
  // Rounding may absorb halalas, never a genuine mismatch between books and XML.
  if (Math.abs(rounding) > Math.max(0.05, lines.length * 0.01)) {
    throw new Error(
      `ZATCA_TOTAL_MISMATCH:${document.invoiceNumber} computes to ${money(gross)} but the books say ${money(payable)}`
    );
  }
  return { lines, groups: [...groups.values()], net, vat, gross, rounding, payable };
};

const TAX_SCHEME = "<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>";

const addressXml = (address: ZatcaAddress) => `
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(address.street)}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(address.building)}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXml(address.district)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(address.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(address.postalCode)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${escapeXml(address.countryCode)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>`;

const partyXml = (party: ZatcaParty) => {
  const identification = party.crNumber
    ? `
      <cac:PartyIdentification><cbc:ID schemeID="CRN">${escapeXml(party.crNumber)}</cbc:ID></cac:PartyIdentification>`
    : "";
  const vat = party.vatNumber
    ? `
      <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(party.vatNumber)}</cbc:CompanyID>${TAX_SCHEME}</cac:PartyTaxScheme>`
    : "";
  return `
    <cac:Party>${identification}${party.address ? addressXml(party.address) : ""}${vat}
      <cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(party.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>`;
};

const amount = (tag: string, value: number) =>
  `<cbc:${tag} currencyID="${CURRENCY}">${money(value)}</cbc:${tag}>`;

const lineXml = (line: ZatcaTotals["lines"][number]) => {
  const discount =
    line.discount > 0
      ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>
      <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>
      ${amount("Amount", line.discount)}
    </cac:AllowanceCharge>`
      : "";
  return `
  <cac:InvoiceLine>
    <cbc:ID>${line.id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escapeXml(line.unitCode)}">${decimal(line.quantity)}</cbc:InvoicedQuantity>
    ${amount("LineExtensionAmount", line.net)}${discount}
    <cac:TaxTotal>
      ${amount("TaxAmount", line.vat)}
      ${amount("RoundingAmount", line.net + line.vat)}
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(line.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${line.taxCategory}</cbc:ID><cbc:Percent>${money(line.taxPercent)}</cbc:Percent>${TAX_SCHEME}</cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${CURRENCY}">${decimal(line.unitPrice)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
};

const subtotalXml = (group: ZatcaTotals["groups"][number]) => {
  const exemption = group.exemptionCode
    ? `<cbc:TaxExemptionReasonCode>${escapeXml(group.exemptionCode)}</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>${escapeXml(group.exemptionReason ?? "")}</cbc:TaxExemptionReason>`
    : "";
  return `
    <cac:TaxSubtotal>
      ${amount("TaxableAmount", group.taxable)}
      ${amount("TaxAmount", group.vat)}
      <cac:TaxCategory><cbc:ID>${group.taxCategory}</cbc:ID><cbc:Percent>${money(group.taxPercent)}</cbc:Percent>${exemption}${TAX_SCHEME}</cac:TaxCategory>
    </cac:TaxSubtotal>`;
};

/** UBL 2.1 in the exact element order of ZATCA's XML implementation standard. */
export const buildZatcaXml = (document: ZatcaDocument, totals = calculateZatcaTotals(document)) => {
  const isNote = document.kind !== "invoice";
  if (isNote && (!document.originalInvoiceNumber || !document.reason)) {
    throw new Error(
      "ZATCA_NOTE_REFERENCE_MISSING: credit and debit notes need the original invoice and a reason."
    );
  }
  const billingReference = isNote
    ? `
  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${escapeXml(document.originalInvoiceNumber ?? "")}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`
    : "";
  const instructionNote = isNote
    ? `<cbc:InstructionNote>${escapeXml(document.reason ?? "")}</cbc:InstructionNote>`
    : "";
  const rounding =
    totals.rounding !== 0
      ? `
    ${amount("PayableRoundingAmount", totals.rounding)}`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(document.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${escapeXml(document.uuid)}</cbc:UUID>
  <cbc:IssueDate>${document.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${document.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${document.simplified ? "0200000" : "0100000"}">${INVOICE_TYPE_CODE[document.kind]}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${CURRENCY}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${CURRENCY}</cbc:TaxCurrencyCode>${billingReference}
  <cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${document.counter}</cbc:UUID></cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${document.previousHash}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>
  <cac:AccountingSupplierParty>${partyXml(document.supplier)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${document.customer ? partyXml(document.customer) : ""}
  </cac:AccountingCustomerParty>
  <cac:Delivery><cbc:ActualDeliveryDate>${document.supplyDate}</cbc:ActualDeliveryDate></cac:Delivery>
  <cac:PaymentMeans><cbc:PaymentMeansCode>1</cbc:PaymentMeansCode>${instructionNote}</cac:PaymentMeans>
  <cac:TaxTotal>
    ${amount("TaxAmount", totals.vat)}${totals.groups.map(subtotalXml).join("")}
  </cac:TaxTotal>
  <cac:TaxTotal>
    ${amount("TaxAmount", totals.vat)}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    ${amount("LineExtensionAmount", totals.net)}
    ${amount("TaxExclusiveAmount", totals.net)}
    ${amount("TaxInclusiveAmount", totals.gross)}
    ${amount("PrepaidAmount", 0)}${rounding}
    ${amount("PayableAmount", totals.payable)}
  </cac:LegalMonetaryTotal>${totals.lines.map(lineXml).join("")}
</Invoice>`;
};

const QR_PATTERN =
  /<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)</;

export const extractQrFromXml = (xml: string) => xml.match(QR_PATTERN)?.[1]?.trim() ?? "";

export type SignedZatcaDocument = {
  uuid: string;
  signedXml: string;
  invoiceHash: string;
  qr: string;
  totals: ZatcaTotals;
};

/** Builds, signs (XAdES, secp256k1) and QR-stamps a document ready for submission. */
export const signZatcaDocument = (params: {
  document: ZatcaDocument;
  privateKeyPem: string;
  /** PEM, or ZATCA's binarySecurityToken (base64 of the base64 certificate). */
  certificate: string;
}): SignedZatcaDocument => {
  const { document, privateKeyPem } = params;
  const totals = calculateZatcaTotals(document);
  const { signedXml, invoiceHash, qr } = signInvoice({
    xml: buildZatcaXml(document, totals),
    privateKeyPem,
    certificate: params.certificate,
    qr: {
      sellerName: document.supplier.name,
      vatNumber: document.supplier.vatNumber,
      timestamp: `${document.issueDate}T${document.issueTime}`,
      total: money(totals.gross),
      vat: money(totals.vat),
    },
  });
  return { uuid: document.uuid, signedXml, invoiceHash, qr, totals };
};

export const toSubmissionBody = (signed: SignedZatcaDocument) => ({
  invoiceHash: signed.invoiceHash,
  uuid: signed.uuid,
  invoice: Buffer.from(signed.signedXml).toString("base64"),
});
