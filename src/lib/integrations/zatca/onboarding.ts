import { asCertificatePem, generateCsr, parseCertificate } from "@/lib/integrations/zatca/certificate";
import { getCompanyById } from "@/lib/data/companies";
import { getIntegrationById, updateIntegration, type IntegrationRecord } from "@/lib/data/integrations";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { ZatcaApi, type ZatcaAlert } from "@/lib/integrations/zatca/api";
import {
  executeZatcaSubmission,
  mapSalesInvoiceToZatca,
  resolveZatcaCredentials,
} from "@/lib/integrations/zatca/service";
import {
  assertZatcaCompanyReady,
  buildZatcaSupplierAddress,
  buildZatcaSupplierInfo,
} from "@/lib/integrations/zatca/company-info";
import {
  buildAndSignComplianceScenario,
  complianceScenariosFor,
  type ComplianceScenarioId,
} from "@/lib/integrations/zatca/compliance-scenarios";
import { signZatcaDocument, toSubmissionBody, type ZatcaSupplier } from "@/lib/integrations/zatca/document";
import { mergedZatcaConfig } from "@/lib/integrations/zatca/mapping";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Certificate expiry for audit metadata; never throws on a malformed certificate. */
const certificateExpiryOf = (certificate: string): string | null => {
  if (!certificate) return null;
  try {
    const info = parseCertificate(certificate);
    return info.validTo;
  } catch {
    return null;
  }
};

const invoiceTypeOf = (config: Record<string, unknown>) => {
  const value = text(config.invoiceType);
  return /^[01]{2}00$/.test(value) && value !== "0000" ? value : "1100";
};

/** ZATCA requires the EGS serial in the form 1-manufacturer|2-model|3-serial. */
const egsSerialOf = (config: Record<string, unknown>, integrationId: string) => {
  const value = text(config.egsSerialNumber);
  return /^1-.+\|2-.+\|3-.+$/.test(value) ? value : `1-SaudiWaqef|2-1.0|3-${integrationId}`;
};

export async function getZatcaIntegrationForCompany(params: {
  integrationId: string;
  companyId: string;
}) {
  const integration = await getIntegrationById(params.integrationId);
  if (
    !integration ||
    integration.companyId !== params.companyId ||
    integration.connector !== "zatca"
  ) {
    throw new Error("ZATCA integration not found.");
  }
  return integration;
}

async function prepareCsr(integration: IntegrationRecord) {
  const company = await getCompanyById(integration.companyId);
  if (!company) throw new Error("Company not found.");
  const config = mergedZatcaConfig(integration);
  assertZatcaCompanyReady(company, config);
  const address = buildZatcaSupplierAddress(company, config);
  const egsSerialNumber = egsSerialOf(config, integration.id);
  const vatNumber = company.vatNumber.trim();
  const csr = generateCsr(
    {
      organizationName: company.legalName,
      // A VAT group (11th digit 1) must name the member's 10-digit TIN here.
      organizationalUnit: text(config.organizationUnit) || company.legalName,
      commonName: `EGS-${vatNumber}-${integration.id.slice(0, 8)}`,
      vatNumber,
      invoiceType: invoiceTypeOf(config),
      registeredAddress: `${address.building} ${address.street}, ${address.district}, ${address.city} ${address.postalCode}`,
      businessCategory: text(config.businessCategory) || "Services",
      egsSerialNumber,
    },
    integration.environment
  );
  return { company, config, csr, egsSerialNumber };
}

export type ComplianceCheck = {
  scenarioId: ComplianceScenarioId;
  gating: true;
  valid: boolean;
  messages: string[];
};

async function runComplianceChecks(params: {
  api: ZatcaApi;
  supplier: ZatcaSupplier;
  config: Record<string, unknown>;
  privateKeyPem: string;
  complianceToken: string;
  complianceSecret: string;
}): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = [];
  for (const scenarioId of complianceScenariosFor(invoiceTypeOf(params.config))) {
    const signed = buildAndSignComplianceScenario(scenarioId, {
      supplier: params.supplier,
      privateKeyPem: params.privateKeyPem,
      certificate: params.complianceToken,
    });
    const result = await params.api.checkCompliance(
      { binarySecurityToken: params.complianceToken, secret: params.complianceSecret },
      toSubmissionBody(signed)
    );
    checks.push({
      scenarioId,
      gating: true,
      valid: result.valid,
      messages: result.alerts.map(
        (alert: ZatcaAlert) => `${alert.severity.toUpperCase()}: ${alert.message}`
      ),
    });
  }
  return checks;
}

export async function requestZatcaComplianceCsid(params: {
  integration: IntegrationRecord;
  otp: string;
}) {
  const { integration } = params;
  if (integration.config?.onboardingStatus === "production_ready") {
    // A new CSR would replace the private key the live certificate belongs to.
    throw new Error("ZATCA_ALREADY_ONBOARDED: renew the certificate instead.");
  }
  const { company, csr, egsSerialNumber } = await prepareCsr(integration);
  const api = new ZatcaApi(integration.environment);
  const issued = await api.issueComplianceCsid(csr.csr, params.otp);

  await updateIntegration(integration.id, {
    credentials: {
      ...(integration.credentials ?? {}),
      privateKeyPem: csr.privateKey,
      publicKeyPem: csr.publicKey,
      complianceToken: issued.binarySecurityToken,
      complianceSecret: issued.secret,
      complianceCertificatePem: asCertificatePem(issued.binarySecurityToken),
      complianceRequestId: issued.requestId,
    },
    config: {
      onboardingStatus: "compliance_csid_issued",
      complianceCsidIssuedAt: new Date().toISOString(),
    },
  });

  return {
    status: "ACCEPTED" as const,
    requestId: issued.requestId,
    onboardingStatus: "compliance_csid_issued",
    csr: {
      commonName: company.legalName || company.name,
      vatNumber: company.vatNumber,
      egsSerialNumber,
    },
  };
}

export async function verifyZatcaCompliance(params: { integration: IntegrationRecord }) {
  const { integration } = params;
  const company = await getCompanyById(integration.companyId);
  if (!company) throw new Error("Company not found.");

  const credentials = integration.credentials ?? {};
  const complianceToken = text(credentials.complianceToken);
  const complianceSecret = text(credentials.complianceSecret);
  const privateKeyPem = text(credentials.privateKeyPem);
  if (!complianceToken || !complianceSecret || !privateKeyPem) {
    throw new Error("Request a compliance CSID first.");
  }

  const config = mergedZatcaConfig(integration);
  const checks = await runComplianceChecks({
    api: new ZatcaApi(integration.environment),
    supplier: buildZatcaSupplierInfo(company, config),
    config,
    privateKeyPem,
    complianceToken,
    complianceSecret,
  });

  const ok = checks.length > 0 && checks.every((check) => check.valid);
  const now = new Date().toISOString();
  if (integration.config?.onboardingStatus === "production_ready") {
    // A re-check of a live integration is informational; it must not undo go-live.
    await updateIntegration(integration.id, ok ? { config: { complianceVerifiedAt: now } } : {});
    return { ok, checks, onboardingStatus: "production_ready" };
  }
  await updateIntegration(integration.id, {
    config: ok
      ? { onboardingStatus: "compliance_verified", complianceVerifiedAt: now, complianceFailureDetail: null }
      : {
          onboardingStatus: "compliance_failed",
          complianceFailedAt: now,
          complianceFailureDetail: checks.filter((check) => !check.valid),
        },
  });

  return { ok, checks, onboardingStatus: ok ? "compliance_verified" : "compliance_failed" };
}

export async function requestZatcaProductionCsid(params: { integration: IntegrationRecord }) {
  const { integration } = params;
  if (integration.config?.onboardingStatus !== "compliance_verified") {
    throw new Error("All compliance checks must pass first.");
  }

  const credentials = integration.credentials ?? {};
  const token = text(credentials.complianceToken);
  const secret = text(credentials.complianceSecret);
  const requestId = text(credentials.complianceRequestId);
  if (!token || !secret || !requestId) {
    throw new Error("Compliance CSID token, secret, and request ID are required.");
  }

  const issued = await new ZatcaApi(integration.environment).issueProductionCsid(
    { binarySecurityToken: token, secret },
    requestId
  );

  await updateIntegration(integration.id, {
    credentials: {
      ...credentials,
      binarySecurityToken: issued.binarySecurityToken,
      secret: issued.secret,
      certificatePem: asCertificatePem(issued.binarySecurityToken),
    },
    config: {
      onboardingStatus: "production_ready",
      productionCsidIssuedAt: new Date().toISOString(),
    },
    status: "active",
    lastError: null,
  });

  return {
    status: "ACCEPTED" as const,
    onboardingStatus: "production_ready",
    requestId: issued.requestId,
  };
}

/**
 * Replaces an expiring production certificate. The live credentials stay
 * untouched until ZATCA has issued the replacement.
 */
export async function renewZatcaCertificate(params: {
  integration: IntegrationRecord;
  otp: string;
}) {
  const { integration } = params;
  const { company, config, csr } = await prepareCsr(integration);
  const api = new ZatcaApi(integration.environment);
  const compliance = await api.issueComplianceCsid(csr.csr, params.otp);
  const checks = await runComplianceChecks({
    api,
    supplier: buildZatcaSupplierInfo(company, config),
    config,
    privateKeyPem: csr.privateKey,
    complianceToken: compliance.binarySecurityToken,
    complianceSecret: compliance.secret,
  });
  if (checks.length === 0 || !checks.every((check) => check.valid)) {
    throw new Error("ZATCA compliance verification failed for the replacement certificate.");
  }
  const production = await api.issueProductionCsid(compliance, compliance.requestId);

  const previous = integration.credentials ?? {};
  const renewedAt = new Date().toISOString();
  await updateIntegration(integration.id, {
    credentials: {
      ...previous,
      privateKeyPem: csr.privateKey,
      publicKeyPem: csr.publicKey,
      complianceToken: compliance.binarySecurityToken,
      complianceSecret: compliance.secret,
      complianceCertificatePem: asCertificatePem(compliance.binarySecurityToken),
      complianceRequestId: compliance.requestId,
      binarySecurityToken: production.binarySecurityToken,
      secret: production.secret,
      certificatePem: asCertificatePem(production.binarySecurityToken),
      // One superseded generation is kept so an unusable replacement can be
      // rolled back without a fresh OTP.
      previousBinarySecurityToken: text(previous.binarySecurityToken) || null,
      previousSecret: text(previous.secret) || null,
      previousCertificatePem: text(previous.certificatePem) || null,
      previousPrivateKeyPem: text(previous.privateKeyPem) || null,
      previousCredentialRetiredAt: renewedAt,
    },
    // productionCsidIssuedAt is the go-live date and must survive renewals.
    config: { zatcaCertExpiryLastAlertTier: null, certificateRenewedAt: renewedAt },
    status: "active",
    lastError: null,
  });
  return {
    status: "ACCEPTED" as const,
    requestId: production.requestId,
    renewedAt,
    previousCertificateExpiry: certificateExpiryOf(text(previous.certificatePem)),
    newCertificateExpiry: certificateExpiryOf(production.binarySecurityToken),
  };
}

/** Signs an invoice for inspection. Uses the next chain position but files nothing. */
export async function signZatcaInvoice(params: {
  integration: IntegrationRecord;
  invoiceId: string;
}) {
  const { integration } = params;
  const invoice = await getSalesInvoiceById(params.invoiceId);
  if (!invoice || invoice.companyId !== integration.companyId) {
    throw new Error("A valid company invoice is required.");
  }

  const credentials = integration.credentials ?? {};
  const resolved = resolveZatcaCredentials(integration);
  const certificate = resolved.certificate || text(credentials.complianceToken);
  if (!resolved.privateKeyPem || !certificate) {
    throw new Error("CSID certificate and private key are required before signing.");
  }

  const document = await mapSalesInvoiceToZatca({ integration, invoice, chain: null });
  const signed = signZatcaDocument({
    document,
    privateKeyPem: resolved.privateKeyPem,
    certificate,
  });

  return {
    invoiceId: invoice.id,
    uuid: document.uuid,
    invoiceType: document.simplified ? "simplified" : "standard",
    invoiceHash: signed.invoiceHash,
    qrCodeBase64: signed.qr,
    signedXmlBase64: Buffer.from(signed.signedXml).toString("base64"),
    signedXmlPreview: signed.signedXml.slice(0, 2000),
  };
}

export async function submitZatcaProductionDocuments(params: { integration: IntegrationRecord }) {
  return executeZatcaSubmission(params.integration);
}
