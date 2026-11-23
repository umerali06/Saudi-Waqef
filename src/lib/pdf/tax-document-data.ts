import type { CompanyRecord } from "@/lib/data/companies";
import { getCompanyById } from "@/lib/data/companies";
import { getCompanyConfig } from "@/lib/data/company-config";
import { getSalesCreditNoteById } from "@/lib/data/credit-notes";
import { getCustomerById, type CustomerRecord } from "@/lib/data/customers";
import { getSalesDebitNoteById } from "@/lib/data/debit-notes";
import { getDocumentBranding } from "@/lib/data/document-branding";
import { listIntegrations } from "@/lib/data/integrations";
import { getSalesInvoiceById, type InvoiceLine } from "@/lib/data/sales-invoices";
import { getZatcaArtifactByInvoiceId } from "@/lib/data/zatca-artifacts";
import { assertPublicUrl } from "@/lib/integrations/url-guard";
import { mergedZatcaConfig } from "@/lib/integrations/zatca/mapping";
import { buildPhase1Qr } from "@/lib/integrations/zatca/phase1-qr";
import { fromRiyadh, resolveIssueTime } from "@/lib/integrations/zatca/time";
import { logger } from "@/lib/ops/logger";
import { formatDocumentDate } from "@/lib/utils/document-date";
import { renderTaxDocument, type TaxDocumentModel, type TaxDocumentParty } from "@/lib/pdf/tax-document";

export type TaxDocumentKind = "invoice" | "credit" | "debit";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** PNG/JPEG bytes of a branding image. A missing image never blocks the document. */
export async function loadImage(url?: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:image/")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    // Cloudinary can serve any upload as PNG, the format PDFs embed safely.
    const source = url.includes("res.cloudinary.com")
      ? url.replace("/image/upload/", "/image/upload/f_png,w_600,c_limit/")
      : url;
    await assertPublicUrl(source);
    const response = await fetch(source, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const isPng = bytes.subarray(0, 4).toString("hex") === "89504e47";
    const isJpeg = bytes.subarray(0, 2).toString("hex") === "ffd8";
    return (isPng || isJpeg) && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
  } catch (error) {
    logger.warn("Branding image could not be loaded for a PDF", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const customerAddress = (customer: CustomerRecord | null, fallback?: string | null) => {
  const address = customer?.billingAddressDetails;
  if (address) {
    return [address.building, address.street, address.district, address.city, address.postalCode]
      .filter(Boolean)
      .join("، ");
  }
  return customer?.billingAddress || fallback || null;
};

/** The seller block: ZATCA onboarding details win, because those are the registered ones. */
export async function sellerOf(company: CompanyRecord): Promise<TaxDocumentParty> {
  const integrations = await listIntegrations(company.id);
  const config = integrations
    .filter((item) => item.connector === "zatca")
    .map(mergedZatcaConfig)
    .find((item) => item.sellerAddress && typeof item.sellerAddress === "object");
  const address = (config?.sellerAddress ?? {}) as Record<string, unknown>;
  const structured = ["building", "street", "district", "city", "postalCode"]
    .map((key) => text(address[key]))
    .filter(Boolean)
    .join("، ");
  return {
    name: text(config?.sellerNameAr) || company.legalName || company.name,
    vatNumber: company.vatNumber ?? null,
    crNumber: company.crNumber ?? null,
    address: structured || company.address || null,
  };
}

type Source = {
  companyId: string;
  customerId: string;
  customerName: string;
  customerVatNumber?: string | null;
  billingAddress?: string | null;
  number: string;
  status: string;
  issueDate: string;
  issueTime: string;
  dueDate?: string | null;
  originalNumber?: string | null;
  reason?: string | null;
  currency: string;
  lines: InvoiceLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  balance?: number;
  notes?: string | null;
  terms?: string | null;
};

async function loadSource(kind: TaxDocumentKind, id: string): Promise<Source | null> {
  if (kind === "invoice") {
    const invoice = await getSalesInvoiceById(id);
    if (!invoice) return null;
    return {
      ...invoice,
      number: invoice.invoiceNumber,
      issueDate: invoice.invoiceDate,
      issueTime: resolveIssueTime(invoice.invoiceDate, invoice.approvedAt),
    };
  }
  const note = kind === "credit" ? await getSalesCreditNoteById(id) : await getSalesDebitNoteById(id);
  if (!note) return null;
  const original = await getSalesInvoiceById(note.invoiceId);
  return {
    companyId: note.companyId,
    customerId: note.customerId,
    customerName: note.customerName,
    customerVatNumber: original?.customerVatNumber ?? null,
    billingAddress: original?.billingAddress ?? null,
    number: "creditNumber" in note ? note.creditNumber : note.debitNumber,
    status: note.status,
    issueDate: note.issueDate,
    issueTime: resolveIssueTime(note.issueDate, note.createdAt.toISOString()),
    originalNumber: note.invoiceNumber,
    reason: note.reason,
    currency: note.currency,
    lines: note.lines,
    subtotal: note.subtotal,
    discountTotal: note.discountTotal,
    taxTotal: note.taxTotal,
    total: note.total,
    notes: note.notes,
  };
}

export async function getTaxDocumentCompanyId(kind: TaxDocumentKind, id: string) {
  return (await loadSource(kind, id))?.companyId ?? null;
}

/** Legal seller details and the QR that belongs on the printed document. */
export async function resolveTaxIdentity(kind: TaxDocumentKind, id: string) {
  const source = await loadSource(kind, id);
  if (!source) return null;
  const company = await getCompanyById(source.companyId);
  if (!company) return null;
  const seller = await sellerOf(company);
  const issued = source.status !== "draft" && source.status !== "canceled";
  // Sandbox and simulation QR codes do not verify in ZATCA's app, so they are never printed.
  const filed = issued ? await getZatcaArtifactByInvoiceId(company.id, id, "production") : null;
  const accepted = filed?.status === "accepted" || filed?.status === "warning" ? filed : null;

  let qr: string | null = null;
  if (accepted?.qr) qr = accepted.qr;
  else if (issued && company.vatNumber) {
    qr = buildPhase1Qr({
      sellerName: seller.name,
      vatNumber: company.vatNumber,
      timestamp: fromRiyadh(source.issueDate, source.issueTime).toISOString().replace(".000Z", "Z"),
      total: source.total,
      vat: source.taxTotal,
    });
  }

  let xml: TaxDocumentModel["xml"] = null;
  if (accepted) {
    const cleared = text(accepted.lastResponse?.clearedInvoice);
    const content = cleared ? Buffer.from(cleared, "base64") : Buffer.from(text(accepted.payload.signedXml));
    if (content.length > 0) {
      // ZATCA's file naming: VAT number, issue timestamp, invoice number.
      const stamp = `${source.issueDate.replace(/-/g, "")}T${source.issueTime.replace(/:/g, "")}`;
      const number = source.number.replace(/[^A-Za-z0-9]/g, "-");
      xml = { name: `${company.vatNumber}_${stamp}_${number}.xml`, content };
    }
  }
  return { source, company, seller, qr, xml, filed: Boolean(accepted) };
}

export async function buildTaxDocumentPdf(kind: TaxDocumentKind, id: string) {
  const identity = await resolveTaxIdentity(kind, id);
  if (!identity) return null;
  const { source, company, seller, qr, xml } = identity;
  const [customer, branding, config] = await Promise.all([
    getCustomerById(source.customerId),
    getDocumentBranding(company.id),
    getCompanyConfig(company.id),
  ]);
  const buyerVat = customer?.vatNumber || source.customerVatNumber || null;
  const [logo, signatureImage] = await Promise.all([
    loadImage(branding.logoUrl),
    config.signatureEnabled ? loadImage(config.signatureImageUrl) : Promise.resolve(null),
  ]);

  const pdf = await renderTaxDocument({
    kind,
    simplified: !buyerVat,
    status: source.status,
    number: source.number,
    issueDate: formatDocumentDate(source.issueDate, config.dateFormat),
    issueTime: source.issueTime,
    supplyDate: formatDocumentDate(source.issueDate, config.dateFormat),
    dueDate: source.dueDate ? formatDocumentDate(source.dueDate, config.dateFormat) : null,
    originalNumber: source.originalNumber,
    reason: source.reason,
    currency: source.currency || "SAR",
    seller,
    buyer: {
      name: customer?.legalName || customer?.name || source.customerName,
      vatNumber: buyerVat,
      crNumber: customer?.crNumber ?? null,
      address: customerAddress(customer, source.billingAddress),
    },
    lines: source.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      discount: line.discountAmount,
      net: line.netAmount,
      taxPercent: Math.round(line.taxRate * 10000) / 100,
      tax: line.taxAmount,
      total: line.totalAmount,
    })),
    subtotal: source.subtotal,
    discountTotal: source.discountTotal,
    taxTotal: source.taxTotal,
    total: source.total,
    amountPaid: source.amountPaid,
    balance: source.balance,
    notes: source.notes,
    terms: source.terms,
    header: branding.header,
    footer: branding.footer,
    signature: config.signatureEnabled
      ? { name: config.signatureName ?? "", title: config.signatureTitle ?? "", image: signatureImage }
      : null,
    accent: branding.accentColor || "#185fa5",
    template: config.invoiceTemplate,
    logo,
    qr,
    xml,
  });
  const fileName = `${source.number.replace(/[^\w.-]+/g, "-")}.pdf`;
  return { pdf, fileName, xml, company, customer, source };
}
