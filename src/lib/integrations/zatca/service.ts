import type { IntegrationRecord } from "@/lib/data/integrations";
import {
  getIntegrationById,
  updateIntegration,
  updateIntegrationZatcaChainInTransaction,
} from "@/lib/data/integrations";
import { getCompanyById, type CompanyRecord } from "@/lib/data/companies";
import { getCustomerById } from "@/lib/data/customers";
import { listSalesInvoices, type SalesInvoice } from "@/lib/data/sales-invoices";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { listSalesDebitNotes } from "@/lib/data/debit-notes";
import { listTaxCategories, type TaxCategory } from "@/lib/data/tax-categories";
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
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { classifyZatcaSubmissionFailure } from "@/lib/integrations/zatca/failure-classification";
import { redactSecrets } from "@/lib/security/redact";
import { assertZatcaCompanyReady } from "@/lib/integrations/zatca/company-info";
import { ZatcaApi } from "@/lib/integrations/zatca/api";
import {
  extractQrFromXml,
  signZatcaDocument,
  toSubmissionBody,
  type ZatcaDocument,
  type ZatcaHashChain,
} from "@/lib/integrations/zatca/document";
import {
  buildZatcaDocument,
  mergedZatcaConfig,
  zatcaDocumentUuid,
  type ZatcaSourceDocument,
} from "@/lib/integrations/zatca/mapping";
import { fromRiyadh, riyadhDateTime } from "@/lib/integrations/zatca/time";
import { reportPlatformEvent } from "@/lib/notifications/platform-events";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const SUBMITTABLE_INVOICE_STATUSES = ["approved", "sent", "partially_paid", "paid"];

/** Exponential backoff for transport failures, capped at 6 hours. */
const retryBackoffMs = (attempt: number) =>
  Math.min(5 * 60 * 1000 * 2 ** Math.max(attempt - 1, 0), 6 * 60 * 60 * 1000);

const readChain = (config: Record<string, unknown> | undefined): ZatcaHashChain | null => {
  const stored = config?.zatcaHashChain;
  if (!stored || typeof stored !== "object") return null;
  const chain = stored as Partial<ZatcaHashChain>;
  return chain.lastHash && chain.counter
    ? {
        lastHash: chain.lastHash,
        lastUuid: chain.lastUuid ?? "",
        counter: chain.counter,
        updatedAt: chain.updatedAt ?? "",
      }
    : null;
};

/** Maps one stored invoice to the document that would be filed. No side effects. */
export async function mapSalesInvoiceToZatca(params: {
  integration: IntegrationRecord;
  invoice: SalesInvoice;
  chain: ZatcaHashChain | null;
}): Promise<ZatcaDocument> {
  const { integration, invoice, chain } = params;
  const [company, customer, taxCategories] = await Promise.all([
    getCompanyById(integration.companyId),
    invoice.customerId ? getCustomerById(invoice.customerId) : Promise.resolve(null),
    listTaxCategories(integration.companyId),
  ]);
  if (!company) throw new Error("Company not found for ZATCA submission.");
  assertZatcaCompanyReady(company, mergedZatcaConfig(integration));
  return buildZatcaDocument({ integration, company, customer, taxCategories, source: invoice, chain });
}

/**
 * Signing material and submission credentials. The developer sandbox hands every
 * taxpayer one shared production certificate that cannot match our key, so there
 * documents are signed with the compliance certificate; simulation and
 * production sign with the real production CSID.
 */
export const resolveZatcaCredentials = (integration: IntegrationRecord) => {
  const credentials = integration.credentials ?? {};
  const binarySecurityToken = text(credentials.binarySecurityToken);
  const secret = text(credentials.secret);
  const privateKeyPem = text(credentials.privateKeyPem);
  const certificate =
    integration.environment === "sandbox"
      ? text(credentials.complianceToken)
      : binarySecurityToken || text(credentials.certificatePem);
  return { binarySecurityToken, secret, privateKeyPem, certificate };
};

type SourceItem = {
  kind: "invoice" | "credit" | "debit";
  issuedAt: number;
  customerId: string;
  source: ZatcaSourceDocument;
  originalInvoiceId?: string;
  note?: { kind: "credit" | "debit"; reason: string; originalInvoiceNumber: string };
};

async function collectDocuments(integration: IntegrationRecord): Promise<SourceItem[]> {
  const [invoices, creditNotes, debitNotes] = await Promise.all([
    listSalesInvoices(integration.companyId),
    listSalesCreditNotes(integration.companyId),
    listSalesDebitNotes(integration.companyId),
  ]);
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const items: SourceItem[] = invoices
    .filter((invoice) => SUBMITTABLE_INVOICE_STATUSES.includes(invoice.status))
    .map((invoice) => ({
      kind: "invoice",
      // Filing order is the order documents became final, not the order drafts were typed.
      issuedAt: invoice.approvedAt ? Date.parse(invoice.approvedAt) : invoice.createdAt.getTime(),
      customerId: invoice.customerId,
      source: invoice,
    }));

  const pushNote = (
    kind: "credit" | "debit",
    note: (typeof creditNotes)[number] | (typeof debitNotes)[number],
    number: string
  ) => {
    if (note.status !== "issued") return;
    const original = invoiceById.get(note.invoiceId);
    items.push({
      kind,
      issuedAt: note.createdAt.getTime(),
      customerId: note.customerId,
      source: {
        id: note.id,
        companyId: note.companyId,
        invoiceNumber: number,
        invoiceDate: note.issueDate,
        currency: note.currency,
        total: note.total,
        lines: note.lines,
        approvedAt: note.createdAt.toISOString(),
        customerName: note.customerName,
        customerVatNumber: original?.customerVatNumber,
        billingAddress: original?.billingAddress,
      },
      originalInvoiceId: note.invoiceId,
      note: {
        kind,
        reason: note.reason?.trim() || (kind === "credit" ? "إشعار دائن" : "إشعار مدين"),
        originalInvoiceNumber: note.invoiceNumber,
      },
    });
  };
  creditNotes.forEach((note) => pushNote("credit", note, note.creditNumber));
  debitNotes.forEach((note) => pushNote("debit", note, note.debitNumber));

  // Documents issued before the taxpayer went live were never e-invoices and
  // must not be filed retroactively.
  const config = mergedZatcaConfig(integration);
  const goLive =
    text(config.submissionStartDate) ||
    (integration.environment !== "sandbox" && text(config.productionCsidIssuedAt)
      ? riyadhDateTime(new Date(text(config.productionCsidIssuedAt))).date
      : "");
  return items
    .filter((item) => !goLive || item.source.invoiceDate >= goLive)
    .sort((a, b) => a.issuedAt - b.issuedAt);
}

export async function executeZatcaSubmission(integration: IntegrationRecord) {
  const { binarySecurityToken, secret, privateKeyPem, certificate } =
    resolveZatcaCredentials(integration);
  if (!binarySecurityToken || !secret || !privateKeyPem || !certificate) {
    throw new Error(
      "ZATCA production CSID token, secret, certificate, and private key are required."
    );
  }

  const runId = await acquireZatcaSubmissionLock(integration.id);
  try {
    // Re-read under the lock: the caller's copy may hold a hash chain from
    // before another run advanced it.
    const fresh = (await getIntegrationById(integration.id)) ?? integration;
    return await runSubmissionLoop(fresh, runId);
  } finally {
    await releaseZatcaSubmissionLock(integration.id, runId).catch((error) => {
      logger.warn("Failed to release ZATCA submission lock", {
        integrationId: integration.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

async function notifyUnhealthy(integration: IntegrationRecord, reason: string) {
  await updateIntegration(integration.id, { status: "error", lastError: reason });
  await notifyCompanyRoles({
    companyId: integration.companyId,
    roles: ["owner", "admin"],
    type: "zatca_integration_unhealthy",
    data: { reason },
  }).catch(() => undefined);
  await reportPlatformEvent({
    kind: "zatca_unhealthy",
    severity: "critical",
    title: { ar: "توقف الربط مع هيئة الزكاة", en: "ZATCA filing stopped" },
    message: {
      ar: `توقف إرسال الفواتير لإحدى الشركات: ${reason}`,
      en: `Invoice filing stopped for a company: ${reason}`,
    },
    path: "/admin/alerts",
    entityId: integration.id,
    companyId: integration.companyId,
    quietMinutes: 360,
  });
}

async function runSubmissionLoop(integration: IntegrationRecord, runId: string) {
  const startedAt = Date.now();
  const credentials = resolveZatcaCredentials(integration);
  const api = new ZatcaApi(integration.environment);
  const [company, taxCategories, documents] = await Promise.all([
    getCompanyById(integration.companyId),
    listTaxCategories(integration.companyId),
    collectDocuments(integration),
  ]);
  if (!company) throw new Error("Company not found for ZATCA submission.");
  assertZatcaCompanyReady(company, mergedZatcaConfig(integration));

  let chain = readChain(integration.config);
  const results: Array<Record<string, unknown>> = [];

  for (const item of documents) {
    const outcome = await submitOne({
      integration,
      company,
      taxCategories,
      item,
      chain,
      credentials,
      api,
    });
    if (!outcome) continue; // already filed
    results.push(outcome.result);

    if (outcome.halt === "auth") {
      await notifyUnhealthy(integration, "ZATCA_AUTHENTICATION_FAILED");
      break;
    }
    if (outcome.halt) break;
    if (!outcome.newChain) continue;

    chain = outcome.newChain;
    try {
      await updateIntegrationZatcaChainInTransaction({
        integrationId: integration.id,
        expectedLockRunId: runId,
        chain,
      });
    } catch (error) {
      // ZATCA has already accepted the document and the artifact says so; that
      // cannot be undone. The stored chain can no longer be trusted, so stop
      // before a later document reuses a stale previous hash.
      logger.error("ZATCA hash-chain lock lost mid-run; stopping sync. Manual recovery required.", {
        integrationId: integration.id,
        ...redactSecrets({ chain }),
        error: error instanceof Error ? error.message : String(error),
      });
      await notifyUnhealthy(integration, "ZATCA_LOCK_LOST");
      break;
    }
  }

  const ok = results.every((result) =>
    ["reported", "cleared", "warning"].includes(String(result.status))
  );
  return {
    ok,
    status: ok ? 200 : 422,
    statusText: ok ? "Accepted" : "Rejected",
    bodyPreview: JSON.stringify({ results }).slice(0, 2000),
    bodyJson: { results },
    requestUrl: `zatca://${integration.environment}`,
    durationMs: Date.now() - startedAt,
    attempt: 1,
    responseHeaders: {},
  };
}

async function submitOne(params: {
  integration: IntegrationRecord;
  company: CompanyRecord;
  taxCategories: TaxCategory[];
  item: SourceItem;
  chain: ZatcaHashChain | null;
  credentials: ReturnType<typeof resolveZatcaCredentials>;
  api: ZatcaApi;
}): Promise<{
  result: Record<string, unknown>;
  newChain?: ZatcaHashChain;
  halt?: "auth" | "undecided";
} | null> {
  const { integration, company, taxCategories, item, chain, credentials, api } = params;
  const sourceId = item.source.id;
  const uuid = zatcaDocumentUuid(integration.companyId, sourceId);
  const existing = await getZatcaArtifactByInvoiceId(
    integration.companyId,
    sourceId,
    integration.environment
  );
  if (existing?.status === "accepted" || existing?.status === "warning") return null;
  if (existing?.nextRetryAt && existing.nextRetryAt.getTime() > Date.now()) {
    // This document's chain position is still undecided, so nothing may overtake it.
    return {
      result: {
        uuid,
        invoiceNumber: item.source.invoiceNumber,
        status: "retry_pending",
        message: `Waiting until ${existing.nextRetryAt.toISOString()} before retrying.`,
      },
      halt: "undecided",
    };
  }

  const attempt = (existing?.attemptCount ?? 0) + 1;
  const base = { uuid, invoiceNumber: item.source.invoiceNumber };

  let document: ZatcaDocument;
  let signed: ReturnType<typeof signZatcaDocument>;
  try {
    const customer = item.customerId ? await getCustomerById(item.customerId) : null;
    document = buildZatcaDocument({
      integration,
      company,
      customer,
      taxCategories,
      source: item.source,
      chain,
      note: item.note,
    });
    signed = signZatcaDocument({
      document,
      privateKeyPem: credentials.privateKeyPem,
      certificate: credentials.certificate,
    });
  } catch (error) {
    // The document itself cannot be built (missing buyer address, exemption
    // reason...). Nothing was sent; report it and let the others through.
    const message = error instanceof Error ? error.message : String(error);
    const response = {
      httpStatus: null,
      alerts: [{ severity: "error", code: message.split(":")[0], category: "LOCAL", message }],
    };
    const artifactId =
      existing?.id ??
      (await createZatcaArtifact({
        companyId: integration.companyId,
        invoiceId: sourceId,
        uuid,
        hash: "",
        qr: "",
        payload: {},
        status: "rejected",
        technicalStatus: "rejected",
        reportingDueAt: null,
        environment: integration.environment,
        documentType: "standard",
        operation: "clearance",
      }));
    await updateZatcaArtifactStatus(artifactId, {
      status: "rejected",
      technicalStatus: "rejected",
      attemptCount: attempt,
      nextRetryAt: null,
      lastResponse: response,
    });
    return { result: { ...base, status: "rejected", message, ...response } };
  }

  const operation = document.simplified ? ("reporting" as const) : ("clearance" as const);
  const documentType = document.simplified ? ("simplified" as const) : ("standard" as const);
  const artifactId =
    existing?.id ??
    (await createZatcaArtifact({
      companyId: integration.companyId,
      invoiceId: sourceId,
      uuid,
      hash: signed.invoiceHash,
      qr: signed.qr,
      payload: { document, signedXml: signed.signedXml },
      status: "pending",
      technicalStatus: "pending_submission",
      reportingDueAt: document.simplified
        ? new Date(fromRiyadh(document.issueDate, document.issueTime).getTime() + 24 * 3600 * 1000)
        : null,
      environment: integration.environment,
      documentType,
      operation,
    }));

  const recordAttempt = async (
    technicalStatus: "reported" | "cleared" | "warning" | "rejected" | "integration_unavailable",
    httpStatus: number | null,
    response: Record<string, unknown>
  ) =>
    recordZatcaSubmissionAttempt({
      artifactId,
      companyId: integration.companyId,
      invoiceId: sourceId,
      uuid,
      environment: integration.environment,
      operation,
      attempt,
      httpStatus,
      technicalStatus,
      response,
    });

  let verdict: Awaited<ReturnType<ZatcaApi["submit"]>>;
  try {
    verdict = await api.submit(
      operation,
      { binarySecurityToken: credentials.binarySecurityToken, secret: credentials.secret },
      toSubmissionBody(signed)
    );
  } catch (error) {
    // No verdict was received, so we cannot know whether ZATCA saw it. The next
    // run resubmits the identical UUID, which ZATCA treats as the same document.
    const message = error instanceof Error ? error.message : String(error);
    const response = { httpStatus: null, alerts: [], error: message };
    await updateZatcaArtifactStatus(artifactId, {
      status: "pending",
      technicalStatus: "integration_unavailable",
      attemptCount: attempt,
      nextRetryAt: new Date(Date.now() + retryBackoffMs(attempt)),
      lastResponse: response,
    });
    await recordAttempt("integration_unavailable", null, response);
    return {
      result: {
        ...base,
        status: "integration_unavailable",
        message: "ZATCA was unreachable; the document stays queued for retry.",
      },
      halt: "undecided",
    };
  }

  const hasWarnings = verdict.alerts.some((alert) => alert.severity === "warning");
  const failureKind = verdict.accepted
    ? null
    : classifyZatcaSubmissionFailure({
        httpStatus: verdict.httpStatus,
        alerts: verdict.alerts,
        response: null,
      });
  const technicalStatus = verdict.accepted
    ? hasWarnings
      ? ("warning" as const)
      : verdict.operation === "reporting"
        ? ("reported" as const)
        : ("cleared" as const)
    : failureKind === "permanent"
      ? ("rejected" as const)
      : ("integration_unavailable" as const);
  const response = {
    httpStatus: verdict.httpStatus,
    alerts: verdict.alerts,
    reportingStatus: verdict.reportingStatus,
    clearanceStatus: verdict.clearanceStatus,
    clearedInvoice: verdict.clearedInvoice,
    alreadySubmitted: verdict.alreadySubmitted,
  };
  // A cleared invoice carries ZATCA's own stamp, and its QR is the one to print.
  const clearedXml = verdict.clearedInvoice
    ? Buffer.from(verdict.clearedInvoice, "base64").toString("utf8")
    : "";

  await updateZatcaArtifactStatus(artifactId, {
    status: verdict.accepted
      ? hasWarnings
        ? "warning"
        : "accepted"
      : failureKind === "permanent"
        ? "rejected"
        : "pending",
    technicalStatus,
    attemptCount: attempt,
    nextRetryAt:
      failureKind === "retryable" || failureKind === "blocked"
        ? new Date(Date.now() + retryBackoffMs(attempt))
        : null,
    providerReference: uuid,
    lastSubmittedAt: new Date(),
    lastResponse: response,
    hash: signed.invoiceHash,
    qr: extractQrFromXml(clearedXml) || signed.qr,
    payload: { document, signedXml: signed.signedXml },
    documentType,
    operation,
  });
  await recordAttempt(technicalStatus, verdict.httpStatus, response);

  const result = {
    ...base,
    status: technicalStatus,
    providerReference: uuid,
    message: verdict.accepted
      ? "Accepted by ZATCA"
      : failureKind === "permanent"
        ? "Rejected by ZATCA"
        : "ZATCA could not process the document; it stays queued for retry.",
    ...response,
  };
  if (verdict.accepted) {
    return {
      result,
      newChain: {
        lastHash: signed.invoiceHash,
        lastUuid: uuid,
        counter: document.counter,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  if (failureKind === "blocked") return { result, halt: "auth" };
  if (failureKind === "retryable") return { result, halt: "undecided" };
  // A permanently rejected document never entered the chain; the next one
  // legitimately takes its position.
  return { result };
}
