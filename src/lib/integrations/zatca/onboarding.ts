import {
  ZatcaApiClient,
  ZatcaError,
  ZatcaErrorCode,
  extractCertificateSignature,
  extractRawPublicKey,
  generateCSR,
  generateInvoiceXml,
  generatePhase2TLV,
  signInvoice,
} from "@talha7k/zatca";
import { getCompanyById } from "@/lib/data/companies";
import { getIntegrationById, updateIntegration, type IntegrationRecord } from "@/lib/data/integrations";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { executeZatcaSubmission, mapSalesInvoiceToZatca } from "@/lib/integrations/zatca/service";
import { buildZatcaSupplierInfo } from "@/lib/integrations/zatca/company-info";
import {
  GATING_SCENARIOS,
  COMPLIANCE_SCENARIOS,
  buildAndSignComplianceScenario,
} from "@/lib/integrations/zatca/compliance-scenarios";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const certificatePemFromToken = (token: string) => {
  if (token.includes("BEGIN CERTIFICATE")) {
    return token;
  }
  const normalized = token.replace(/\s/g, "");
  return `-----BEGIN CERTIFICATE-----\n${normalized.match(/.{1,64}/g)?.join("\n") ?? normalized}\n-----END CERTIFICATE-----`;
};

const mergedZatcaConfig = (integration: IntegrationRecord) => {
  const rootConfig = integration.config ?? {};
  return rootConfig.mapping &&
    typeof rootConfig.mapping === "object" &&
    !Array.isArray(rootConfig.mapping)
    ? { ...rootConfig, ...(rootConfig.mapping as Record<string, unknown>) }
    : rootConfig;
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

export async function requestZatcaComplianceCsid(params: {
  integration: IntegrationRecord;
  otp: string;
}) {
  const integration = params.integration;
  const company = await getCompanyById(integration.companyId);
  if (!company?.vatNumber || !company.crNumber) {
    throw new Error("Company VAT and commercial registration numbers are required.");
  }

  const config = mergedZatcaConfig(integration);
  const sellerAddress =
    config.sellerAddress && typeof config.sellerAddress === "object"
      ? (config.sellerAddress as Record<string, unknown>)
      : {};

  const csr = generateCSR(
    {
      organizationNameAr: text(config.sellerNameAr) || company.legalName || company.name,
      organizationNameEn: company.legalName || company.name,
      vatNumber: company.vatNumber,
      crNumber: company.crNumber,
      country: "SA",
      commonName: company.legalName || company.name,
      invoiceType: text(config.invoiceType) || "1100",
      businessCategory: text(config.businessCategory) || "Accounting",
      location: {
        city: text(sellerAddress.city) || "Riyadh",
        district: text(sellerAddress.district) || "Not provided",
        street: text(sellerAddress.street) || company.address || "Not provided",
        buildingNumber: text(sellerAddress.building) || "0000",
        postalCode: text(sellerAddress.postalCode) || "00000",
      },
      egsSerialNumber: text(config.egsSerialNumber) || integration.id,
    },
    integration.environment
  );

  const client = new ZatcaApiClient({
    environment: integration.environment,
    timeout: 30000,
  });
  const result = await client.requestComplianceCSID(csr.csr, params.otp);
  if (result.status !== "ACCEPTED") {
    throw new ZatcaError(
      result.error?.message || "Compliance CSID rejected.",
      ZatcaErrorCode.API_ERROR,
      result.error
    );
  }

  const credentials = integration.credentials ?? {};
  await updateIntegration(integration.id, {
    credentials: {
      ...credentials,
      privateKeyPem: csr.privateKey,
      publicKeyPem: csr.publicKey,
      complianceToken: result.binarySecurityToken,
      complianceSecret: result.secret,
      complianceCertificatePem: certificatePemFromToken(result.binarySecurityToken),
      complianceRequestId: result.requestId,
    },
    config: {
      ...(integration.config ?? {}),
      onboardingStatus: "compliance_csid_issued",
      complianceCsidIssuedAt: new Date().toISOString(),
    },
  });

  return {
    status: result.status,
    requestId: result.requestId,
    onboardingStatus: "compliance_csid_issued",
    csr: {
      commonName: company.legalName || company.name,
      vatNumber: company.vatNumber,
      egsSerialNumber: text(config.egsSerialNumber) || integration.id,
    },
  };
}

export async function verifyZatcaCompliance(params: { integration: IntegrationRecord }) {
  const integration = params.integration;
  const company = await getCompanyById(integration.companyId);
  if (!company) {
    throw new Error("Company not found.");
  }

  const credentials = integration.credentials ?? {};
  const token = text(credentials.complianceToken);
  const secret = text(credentials.complianceSecret);
  const privateKeyPem = text(credentials.privateKeyPem);
  const cert = text(credentials.complianceCertificatePem) || certificatePemFromToken(token);
  if (!token || !secret || !privateKeyPem) {
    throw new Error("Request a compliance CSID first.");
  }

  const config = mergedZatcaConfig(integration);
  const supplier = buildZatcaSupplierInfo(company, config);
  const client = new ZatcaApiClient({
    environment: integration.environment,
    timeout: 30000,
  });

  const checks: Array<{ scenarioId: string; gating: boolean; valid: boolean; messages: string[] }> = [];
  for (const scenarioId of COMPLIANCE_SCENARIOS) {
    const scenario = buildAndSignComplianceScenario(scenarioId, {
      supplier,
      privateKeyPem,
      certificatePem: cert,
    });
    const verification = await client.verifyCompliance(
      { binarySecurityToken: token, secret },
      scenario.invoiceHash,
      scenario.uuid,
      Buffer.from(scenario.signedXml).toString("base64")
    );
    checks.push({
      scenarioId,
      gating: (GATING_SCENARIOS as string[]).includes(scenarioId),
      ...verification,
    });
  }

  const ok = checks.filter((check) => check.gating).every((check) => check.valid);
  if (ok) {
    await updateIntegration(integration.id, {
      config: {
        ...(integration.config ?? {}),
        onboardingStatus: "compliance_verified",
        complianceVerifiedAt: new Date().toISOString(),
      },
    });
  } else {
    await updateIntegration(integration.id, {
      config: {
        ...(integration.config ?? {}),
        onboardingStatus: "compliance_failed",
        complianceFailedAt: new Date().toISOString(),
        complianceFailureDetail: checks.filter((check) => check.gating && !check.valid),
      },
    });
  }

  return { ok, checks, onboardingStatus: ok ? "compliance_verified" : "compliance_failed" };
}

export async function requestZatcaProductionCsid(params: {
  integration: IntegrationRecord;
}) {
  const integration = params.integration;
  const config = integration.config ?? {};
  if (config.onboardingStatus !== "compliance_verified") {
    throw new Error("All compliance checks must pass first.");
  }

  const credentials = integration.credentials ?? {};
  const token = text(credentials.complianceToken);
  const secret = text(credentials.complianceSecret);
  const requestId = text(credentials.complianceRequestId);
  if (!token || !secret || !requestId) {
    throw new Error("Compliance CSID token, secret, and request ID are required.");
  }

  const client = new ZatcaApiClient({
    environment: integration.environment,
    timeout: 30000,
  });
  const result = await client.requestProductionCSID({ binarySecurityToken: token, secret }, requestId);
  if (result.status !== "ACCEPTED") {
    throw new ZatcaError(
      result.error?.message || "Production CSID rejected.",
      ZatcaErrorCode.API_ERROR,
      result.error
    );
  }

  await updateIntegration(integration.id, {
    credentials: {
      ...credentials,
      binarySecurityToken: result.binarySecurityToken,
      secret: result.secret,
      certificatePem: certificatePemFromToken(result.binarySecurityToken),
    },
    config: {
      ...config,
      onboardingStatus: "production_ready",
      productionCsidIssuedAt: new Date().toISOString(),
    },
    status: "active",
  });

  return {
    status: result.status,
    onboardingStatus: "production_ready",
    requestId: result.requestId,
  };
}

export async function signZatcaInvoice(params: {
  integration: IntegrationRecord;
  invoiceId: string;
}) {
  const integration = params.integration;
  const invoice = await getSalesInvoiceById(params.invoiceId);
  if (!invoice || invoice.companyId !== integration.companyId) {
    throw new Error("A valid company invoice is required.");
  }

  const credentials = integration.credentials ?? {};
  const privateKeyPem = text(credentials.privateKeyPem);
  const certificatePem =
    text(credentials.certificatePem) ||
    text(credentials.complianceCertificatePem) ||
    certificatePemFromToken(text(credentials.binarySecurityToken) || text(credentials.complianceToken));
  if (!privateKeyPem || !certificatePem) {
    throw new Error("CSID certificate and private key are required before signing.");
  }

  const document = await mapSalesInvoiceToZatca({
    integration,
    invoice,
    chain: { lastHash: "", lastUuid: "", counter: 0, updatedAt: new Date().toISOString() },
  });
  const xml = generateInvoiceXml(document);
  const signed = signInvoice({
    xml,
    privateKeyPem,
    certificatePem,
    qrData: {
      sellerName: document.supplier.nameEn,
      vatNumber: document.supplier.vatNumber,
      timestamp: `${document.issueDate}T${document.issueTime}Z`,
      totalWithVat: document.taxInclusiveAmount.toFixed(2),
      vatTotal: document.taxAmount.toFixed(2),
      certificateSignature: extractCertificateSignature(certificatePem),
    },
  });
  const qrCodeBase64 = generatePhase2TLV({
    sellerName: document.supplier.nameEn,
    vatNumber: document.supplier.vatNumber,
    timestamp: `${document.issueDate}T${document.issueTime}Z`,
    totalWithVat: document.taxInclusiveAmount.toFixed(2),
    vatTotal: document.taxAmount.toFixed(2),
    invoiceHash: signed.invoiceHash,
    signatureValue: signed.signatureValue,
    publicKey: extractRawPublicKey(certificatePem),
    certificateSignature: extractCertificateSignature(certificatePem),
  });

  return {
    invoiceId: invoice.id,
    uuid: document.uuid,
    invoiceType: document.profileId,
    invoiceHash: signed.invoiceHash,
    qrCodeBase64,
    signedXmlBase64: Buffer.from(signed.signedXml).toString("base64"),
    signedXmlPreview: signed.signedXml.slice(0, 2000),
  };
}

export async function submitZatcaProductionDocuments(params: {
  integration: IntegrationRecord;
}) {
  return executeZatcaSubmission(params.integration);
}
