import { v5 as uuidv5 } from "uuid";
import {
  extractCertificateSignature,
  submitInvoice,
  type HashChainState,
  type CreditNoteData,
  type InvoiceData,
  type PostalAddress,
  type TaxCategoryId,
} from "@talha7k/zatca";
import type { IntegrationRecord } from "@/lib/data/integrations";
import { updateIntegration } from "@/lib/data/integrations";
import { getCompanyById } from "@/lib/data/companies";
import { getCustomerById } from "@/lib/data/customers";
import { listSalesInvoices, type SalesInvoice } from "@/lib/data/sales-invoices";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import {
  createZatcaArtifact,
  getZatcaArtifactByInvoiceId,
  updateZatcaArtifactStatus,
} from "@/lib/data/zatca-artifacts";

const UUID_NAMESPACE = "f1c74ab4-9968-48f5-a919-6f6f01d93086";

const stringValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const pemFromToken = (token: string) => {
  if (token.includes("BEGIN CERTIFICATE")) return token;
  const normalized = token.replace(/\s/g, "");
  const lines = normalized.match(/.{1,64}/g)?.join("\n") ?? normalized;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
};

const parseAddress = (value: unknown, fallback?: string): PostalAddress => {
  const address = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    street: stringValue(address.street) || fallback || "Not provided",
    building: stringValue(address.building) || "0000",
    district: stringValue(address.district) || "Not provided",
    city: stringValue(address.city) || "Riyadh",
    postalCode: stringValue(address.postalCode) || "00000",
    countryCode: stringValue(address.countryCode) || "SA",
  };
};

const taxCategory = (value: unknown, rate: number): TaxCategoryId => {
  const normalized = stringValue(value).toUpperCase();
  if (["S", "Z", "E", "O", "AE"].includes(normalized)) return normalized as TaxCategoryId;
  return rate > 0 ? "S" : "Z";
};

export const mapSalesInvoiceToZatca = async (params: {
  integration: IntegrationRecord;
  invoice: SalesInvoice;
  chain: HashChainState;
}): Promise<InvoiceData> => {
  const company = await getCompanyById(params.integration.companyId);
  if (!company) throw new Error("Company not found for ZATCA submission.");
  const customer = params.invoice.customerId
    ? await getCustomerById(params.invoice.customerId)
    : null;
  const rootConfig = params.integration.config ?? {};
  const config = rootConfig.mapping && typeof rootConfig.mapping === "object" && !Array.isArray(rootConfig.mapping)
    ? { ...rootConfig, ...(rootConfig.mapping as Record<string, unknown>) }
    : rootConfig;
  const customerVat = customer?.vatNumber || params.invoice.customerVatNumber || "";
  const isStandard = Boolean(customerVat);

  const taxGroups = new Map<string, { taxableAmount: number; taxAmount: number; percent: number; taxCategoryId: TaxCategoryId }>();
  const invoiceLines = params.invoice.lines.map((line, index) => {
    const category = taxCategory(line.taxCategoryId, line.taxRate);
    const key = `${category}:${line.taxRate}`;
    const group = taxGroups.get(key) ?? { taxableAmount: 0, taxAmount: 0, percent: line.taxRate, taxCategoryId: category };
    group.taxableAmount += line.netAmount;
    group.taxAmount += line.taxAmount;
    taxGroups.set(key, group);
    return {
      id: index + 1,
      quantity: line.quantity,
      unitCode: line.unit || "C62",
      lineExtensionAmount: line.netAmount,
      taxAmount: line.taxAmount,
      itemName: line.description,
      taxCategoryId: category,
      taxPercent: line.taxRate,
      priceAmount: line.unitPrice,
      ...(line.discountAmount > 0 ? {
        allowanceCharges: [{
          chargeIndicator: false,
          reason: "Discount",
          amount: line.discountAmount,
          taxCategoryId: category,
          taxPercent: line.taxRate,
        }],
      } : {}),
    };
  });

  const uuid = uuidv5(`${params.integration.companyId}:${params.invoice.id}`, UUID_NAMESPACE);
  return {
    invoiceNumber: params.invoice.invoiceNumber,
    uuid,
    issueDate: params.invoice.invoiceDate,
    issueTime: params.invoice.approvedAt?.slice(11, 19) || "00:00:00",
    invoiceTypeCode: "388",
    invoiceTypeCodeName: isStandard ? "0100000" : "0200000",
    profileId: isStandard ? "clearance:1.0" : "reporting:1.0",
    currencyCode: params.invoice.currency || "SAR",
    invoiceCounter: params.chain.counter + 1,
    previousInvoiceHash: params.chain.lastHash || undefined,
    supplier: {
      nameAr: stringValue(config.sellerNameAr) || company.legalName || company.name,
      nameEn: company.legalName || company.name,
      vatNumber: company.vatNumber || "",
      crNumber: company.crNumber,
      address: parseAddress(config.sellerAddress, company.address),
    },
    ...(isStandard ? {
      customer: {
        name: customer?.legalName || customer?.name || params.invoice.customerName,
        vatNumber: customerVat,
        address: parseAddress(config.customerAddress, customer?.billingAddress || params.invoice.billingAddress),
      },
    } : {}),
    lineExtensionAmount: params.invoice.subtotal,
    taxExclusiveAmount: params.invoice.subtotal - params.invoice.discountTotal,
    taxInclusiveAmount: params.invoice.total,
    allowanceTotalAmount: params.invoice.discountTotal || undefined,
    payableAmount: params.invoice.total,
    taxAmount: params.invoice.taxTotal,
    taxSubtotals: Array.from(taxGroups.values()),
    invoiceLines,
  };
};

export async function executeZatcaSubmission(integration: IntegrationRecord) {
  const credentials = integration.credentials ?? {};
  const binarySecurityToken = stringValue(credentials.binarySecurityToken) || stringValue(credentials.apiKey);
  const secret = stringValue(credentials.secret) || stringValue(credentials.password);
  const privateKeyPem = stringValue(credentials.privateKeyPem);
  const certificatePem = stringValue(credentials.certificatePem) || pemFromToken(binarySecurityToken);
  if (!binarySecurityToken || !secret || !privateKeyPem || !certificatePem) {
    throw new Error("ZATCA production CSID token, secret, certificate, and private key are required.");
  }

  const storedChain = integration.config?.zatcaHashChain;
  let chain: HashChainState = storedChain && typeof storedChain === "object"
    ? storedChain as HashChainState
    : { lastHash: "", lastUuid: "", counter: 0, updatedAt: new Date(0).toISOString() };
  const invoices = (await listSalesInvoices(integration.companyId))
    .filter((invoice) => ["approved", "sent", "partially_paid", "paid"].includes(invoice.status))
    .map((invoice) => ({ kind: "invoice" as const, createdAt: invoice.createdAt, invoice }));
  const invoiceById = new Map(invoices.map((item) => [item.invoice.id, item.invoice]));
  const creditNotes = (await listSalesCreditNotes(integration.companyId))
    .filter((note) => note.status === "issued")
    .map((note) => ({ kind: "credit" as const, createdAt: note.createdAt, note }));
  const documents = [...invoices, ...creditNotes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const results: Array<Record<string, unknown>> = [];

  for (const source of documents) {
    const sourceId = source.kind === "invoice" ? source.invoice.id : source.note.id;
    const existing = await getZatcaArtifactByInvoiceId(sourceId);
    if (existing?.status === "accepted") continue;
    let document: InvoiceData | CreditNoteData;
    if (source.kind === "invoice") {
      document = await mapSalesInvoiceToZatca({ integration, invoice: source.invoice, chain });
    } else {
      const original = invoiceById.get(source.note.invoiceId);
      if (!original) throw new Error(`Original invoice ${source.note.invoiceNumber} is required for its ZATCA credit note.`);
      const mapped = await mapSalesInvoiceToZatca({
        integration,
        invoice: {
          ...original,
          id: source.note.id,
          invoiceNumber: source.note.creditNumber,
          invoiceDate: source.note.issueDate,
          subtotal: source.note.subtotal,
          discountTotal: source.note.discountTotal,
          taxTotal: source.note.taxTotal,
          total: source.note.total,
          lines: source.note.lines,
          createdAt: source.note.createdAt,
        },
        chain,
      });
      const originalUuid = uuidv5(`${integration.companyId}:${original.id}`, UUID_NAMESPACE);
      document = {
        ...mapped,
        invoiceTypeCode: "381",
        originalInvoiceNumber: original.invoiceNumber,
        originalInvoiceUuid: originalUuid,
        originalInvoiceDate: original.invoiceDate,
        reason: source.note.reason || "Credit note",
      };
    }
    const result = await submitInvoice({
      invoice: document,
      privateKeyPem,
      certificatePem,
      certificateSignature: extractCertificateSignature(certificatePem),
      credentials: { binarySecurityToken, secret },
      apiConfig: { environment: integration.environment, timeout: 30000, clearanceStatus: "1" },
      hashChainState: chain,
    });
    const accepted = result.success;
    const response = result.zatcaResult.response;
    const responseRecord = {
      httpStatus: result.zatcaResult.httpStatus,
      alerts: result.zatcaResult.alerts ?? [],
      reportingStatus: response?.reportingStatus ?? null,
      clearanceStatus: response?.clearanceStatus ?? null,
      clearedInvoice: response?.clearedInvoice ?? null,
    };
    let artifactId = existing?.id;
    if (!artifactId) {
      artifactId = await createZatcaArtifact({
        companyId: integration.companyId,
        invoiceId: sourceId,
        uuid: document.uuid,
        hash: result.invoiceHash,
        qr: result.qrCodeBase64,
        payload: { document, signedXml: result.signedXml },
        status: accepted ? "accepted" : "rejected",
      });
    }
    await updateZatcaArtifactStatus(artifactId, {
      status: accepted ? "accepted" : "rejected",
      providerReference: document.uuid,
      lastSubmittedAt: new Date(),
      lastResponse: responseRecord,
    });
    results.push({
      uuid: document.uuid,
      status: accepted ? "accepted" : "rejected",
      providerReference: document.uuid,
      message: accepted ? "Accepted by ZATCA" : "Rejected by ZATCA",
      ...responseRecord,
    });
    if (!accepted) break;
    if (result.newHashChainState) {
      chain = result.newHashChainState;
      await updateIntegration(integration.id, {
        config: { ...(integration.config ?? {}), zatcaHashChain: chain },
      });
    }
  }

  const ok = results.every((result) => result.status === "accepted");
  return {
    ok,
    status: ok ? 200 : 422,
    statusText: ok ? "Accepted" : "Rejected",
    bodyPreview: JSON.stringify({ results }).slice(0, 2000),
    bodyJson: { results },
    requestUrl: `zatca://${integration.environment}`,
    durationMs: 0,
    attempt: 1,
    responseHeaders: {},
  };
}
