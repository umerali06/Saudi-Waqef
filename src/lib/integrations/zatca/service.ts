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
import { updateIntegration, updateIntegrationZatcaChainInTransaction } from "@/lib/data/integrations";
import { getCompanyById } from "@/lib/data/companies";
import { getCustomerById } from "@/lib/data/customers";
import { listSalesInvoices, type SalesInvoice } from "@/lib/data/sales-invoices";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { listSalesDebitNotes } from "@/lib/data/debit-notes";
import {
  createZatcaArtifact,
  getZatcaArtifactByInvoiceId,
  recordZatcaSubmissionAttempt,
  updateZatcaArtifactStatus,
} from "@/lib/data/zatca-artifacts";
import {
  acquireZatcaSubmissionLock,
  releaseZatcaSubmissionLock,
} from "@/lib/integrations/zatca/submission-lock";
import { logger } from "@/lib/ops/logger";
import { redactSecrets } from "@/lib/security/redact";
import { assertZatcaCompanyReady, buildZatcaSupplierAddress } from "@/lib/integrations/zatca/company-info";

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
  assertZatcaCompanyReady(company, config);

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
      address: buildZatcaSupplierAddress(company, config),
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

  const runId = await acquireZatcaSubmissionLock(integration.id);
  try {
    return await runZatcaSubmissionLoop({ integration, binarySecurityToken, secret, privateKeyPem, certificatePem, runId });
  } finally {
    await releaseZatcaSubmissionLock(integration.id, runId).catch((error) => {
      logger.warn("Failed to release ZATCA submission lock", {
        integrationId: integration.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

async function runZatcaSubmissionLoop(params: {
  integration: IntegrationRecord;
  binarySecurityToken: string;
  secret: string;
  privateKeyPem: string;
  certificatePem: string;
  runId: string;
}) {
  const { integration, binarySecurityToken, secret, privateKeyPem, certificatePem, runId } = params;
  const storedChain = integration.config?.zatcaHashChain;
  let chain: HashChainState = storedChain && typeof storedChain === "object"
    ? storedChain as HashChainState
    : { lastHash: "", lastUuid: "", counter: 0, updatedAt: new Date(0).toISOString() };
  const invoices = (await listSalesInvoices(integration.companyId))
    .filter((invoice) => ["approved", "sent", "partially_paid", "paid"].includes(invoice.status))
    .map((invoice) => ({ kind: "invoice" as const, createdAt: invoice.createdAt, invoice }));
  const invoiceById = new Map<string, SalesInvoice>(invoices.map((item) => [item.invoice.id, item.invoice]));
  const creditNotes = (await listSalesCreditNotes(integration.companyId))
    .filter((note) => note.status === "issued")
    .map((note) => ({ kind: "credit" as const, createdAt: note.createdAt, note }));
  const debitNotes = (await listSalesDebitNotes(integration.companyId))
    .filter((note) => note.status === "issued")
    .map((note) => ({ kind: "debit" as const, createdAt: note.createdAt, note }));
  const documents = [...invoices, ...creditNotes, ...debitNotes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const results: Array<Record<string, unknown>> = [];

  for (const source of documents) {
    const sourceId = source.kind === "invoice" ? source.invoice.id : source.note.id;
    const existing = await getZatcaArtifactByInvoiceId(integration.companyId, sourceId);
    if (existing?.status === "accepted" || existing?.status === "warning") continue;
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
        invoiceNumber: source.kind === "credit" ? source.note.creditNumber : source.note.debitNumber,
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
        invoiceTypeCode: source.kind === "credit" ? "381" : "383",
        originalInvoiceNumber: original.invoiceNumber,
        originalInvoiceUuid: originalUuid,
        originalInvoiceDate: original.invoiceDate,
        reason: source.note.reason || (source.kind === "credit" ? "Credit note" : "Debit note"),
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
    const isReporting = document.profileId === "reporting:1.0";
    const alerts = result.zatcaResult.alerts ?? [];
    const hasWarnings = alerts.some((alert) => {
      if (!alert || typeof alert !== "object") return false;
      const row = alert as unknown as Record<string, unknown>;
      return String(row.type ?? row.status ?? row.category ?? "").toLowerCase().includes("warn");
    });
    const technicalStatus = !accepted
      ? "rejected" as const
      : hasWarnings
        ? "warning" as const
        : isReporting
          ? "reported" as const
          : "cleared" as const;
    const reportingDueAt = isReporting
      ? new Date(new Date(`${document.issueDate}T${document.issueTime}Z`).getTime() + 24 * 60 * 60 * 1000)
      : null;
    let artifactId = existing?.id;
    if (!artifactId) {
      artifactId = await createZatcaArtifact({
        companyId: integration.companyId,
        invoiceId: sourceId,
        uuid: document.uuid,
        hash: result.invoiceHash,
        qr: result.qrCodeBase64,
        payload: { document, signedXml: result.signedXml },
        status: accepted ? (hasWarnings ? "warning" : "accepted") : "rejected",
        technicalStatus,
        reportingDueAt,
        environment: integration.environment,
        documentType: isReporting ? "simplified" : "standard",
        operation: isReporting ? "reporting" : "clearance",
      });
    }
    if (!artifactId) throw new Error("ZATCA_ARTIFACT_CREATE_FAILED");
    // This artifact write is independent of the hash-chain lock below and must
    // always happen: ZATCA really did accept/reject this document regardless
    // of whether we can still safely persist the updated chain state.
    await updateZatcaArtifactStatus(artifactId, {
      status: accepted ? (hasWarnings ? "warning" : "accepted") : "rejected",
      technicalStatus,
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      nextRetryAt: null,
      providerReference: document.uuid,
      lastSubmittedAt: new Date(),
      lastResponse: responseRecord,
    });
    await recordZatcaSubmissionAttempt({
      artifactId,
      companyId: integration.companyId,
      invoiceId: sourceId,
      uuid: document.uuid,
      environment: integration.environment,
      operation: isReporting ? "reporting" : "clearance",
      attempt: (existing?.attemptCount ?? 0) + 1,
      httpStatus: result.zatcaResult.httpStatus,
      technicalStatus,
      response: responseRecord,
    });
    results.push({
      uuid: document.uuid,
      status: technicalStatus,
      providerReference: document.uuid,
      message: accepted ? "Accepted by ZATCA" : "Rejected by ZATCA",
      ...responseRecord,
    });
    if (!accepted) break;
    if (result.newHashChainState) {
      chain = result.newHashChainState;
      try {
        await updateIntegrationZatcaChainInTransaction({
          integrationId: integration.id,
          expectedLockRunId: runId,
          chain,
        });
      } catch (error) {
        // The document above was already accepted by ZATCA and recorded in
        // zatca_artifacts — that cannot and must not be undone. But we no
        // longer trust our in-memory chain state to be the true tail, so we
        // stop rather than risk submitting the next document with a stale
        // previousInvoiceHash. Manual recovery: resync config.zatcaHashChain
        // from the latest accepted zatca_artifacts document for this company.
        logger.error("ZATCA hash-chain lock lost mid-run; stopping sync. Manual recovery required.", {
          integrationId: integration.id,
          lastAcceptedUuid: document.uuid,
          ...redactSecrets({ chain }),
          error: error instanceof Error ? error.message : String(error),
        });
        await updateIntegration(integration.id, {
          status: "error",
          lastError: "ZATCA_LOCK_LOST",
        });
        break;
      }
    }
  }

  const ok = results.every((result) => ["accepted", "reported", "cleared", "warning"].includes(String(result.status)));
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
