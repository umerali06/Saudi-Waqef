import {
  ZatcaApiClient,
  extractCertificateSignature,
  extractRawPublicKey,
  generateCSR,
  generateCreditNoteXml,
  generateInvoiceXml,
  generatePhase2TLV,
  signInvoice,
  type CreditNoteData,
  type InvoiceData,
} from "@talha7k/zatca";
import { getCompanyById } from "@/lib/data/companies";
import { getIntegrationById, updateIntegration, type IntegrationRecord } from "@/lib/data/integrations";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { executeZatcaSubmission, mapSalesInvoiceToZatca } from "@/lib/integrations/zatca/service";

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
    throw new Error(result.error?.message || "Compliance CSID rejected.");
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

export async function verifyZatcaCompliance(params: {
  integration: IntegrationRecord;
  invoiceId: string;
}) {
  const integration = params.integration;
  const invoice = await getSalesInvoiceById(params.invoiceId);
  if (!invoice || invoice.companyId !== integration.companyId) {
    throw new Error("A valid company invoice is required.");
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
  const client = new ZatcaApiClient({
    environment: integration.environment,
    timeout: 30000,
  });
  const base = await mapSalesInvoiceToZatca({
    integration,
    invoice,
    chain: { lastHash: "", lastUuid: "", counter: 0, updatedAt: new Date().toISOString() },
  });
  const checks: Array<{ kind: string; valid: boolean; messages: string[] }> = [];
  let counter = 0;

  for (const subtype of ["0100000", "0200000"] as const) {
    for (const code of ["388", "381", "383"] as const) {
      counter += 1;
      const uuid = crypto.randomUUID();
      const document = {
        ...base,
        uuid,
        invoiceNumber: `COMP-${subtype.slice(0, 2)}-${code}-${counter}`,
        invoiceCounter: counter,
        invoiceTypeCode: code,
        invoiceTypeCodeName: subtype,
        profileId: subtype === "0100000" ? "clearance:1.0" : "reporting:1.0",
        ...(subtype === "0100000" && !base.customer
          ? {
              customer: {
                name: text(config.complianceBuyerName) || "Compliance Buyer",
                vatNumber:
                  text(config.complianceBuyerVatNumber) ||
                  companyVatFallback(base.supplier.vatNumber),
                address: base.supplier.address,
              },
            }
          : {}),
      } as InvoiceData;

      const xml =
        code === "381"
          ? generateCreditNoteXml({
              ...document,
              originalInvoiceNumber: invoice.invoiceNumber,
              originalInvoiceUuid: base.uuid,
              originalInvoiceDate: invoice.invoiceDate,
              reason: "Compliance test",
            } as CreditNoteData)
          : generateInvoiceXml(document);
      const signed = signInvoice({
        xml,
        privateKeyPem,
        certificatePem: cert,
        qrData: {
          sellerName: base.supplier.nameEn,
          vatNumber: base.supplier.vatNumber,
          timestamp: `${document.issueDate}T${document.issueTime}Z`,
          totalWithVat: document.taxInclusiveAmount.toFixed(2),
          vatTotal: document.taxAmount.toFixed(2),
          certificateSignature: extractCertificateSignature(cert),
        },
      });
      const verification = await client.verifyCompliance(
        { binarySecurityToken: token, secret },
        signed.invoiceHash,
        uuid,
        Buffer.from(signed.signedXml).toString("base64")
      );
      checks.push({ kind: `${subtype}:${code}`, ...verification });
    }
  }

  const ok = checks.every((check) => check.valid);
  if (ok) {
    await updateIntegration(integration.id, {
      config: {
        ...(integration.config ?? {}),
        onboardingStatus: "compliance_verified",
        complianceVerifiedAt: new Date().toISOString(),
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
    throw new Error(result.error?.message || "Production CSID rejected.");
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

function companyVatFallback(vat: string) {
  return vat === "300000000000003" ? "310000000000003" : "300000000000003";
}
