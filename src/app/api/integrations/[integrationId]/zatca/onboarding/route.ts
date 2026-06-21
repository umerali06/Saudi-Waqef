import { NextResponse } from "next/server";
import {
  ZatcaApiClient,
  extractCertificateSignature,
  generateCSR,
  generateCreditNoteXml,
  generateInvoiceXml,
  signInvoice,
  type CreditNoteData,
  type InvoiceData,
} from "@talha7k/zatca";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getIntegrationById, updateIntegration } from "@/lib/data/integrations";
import { getCompanyById } from "@/lib/data/companies";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { mapSalesInvoiceToZatca } from "@/lib/integrations/zatca/service";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type Context = { params: Promise<{ integrationId: string }> };
type Action = "compliance-csid" | "verify-compliance" | "production-csid";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const certificatePem = (token: string) => {
  if (token.includes("BEGIN CERTIFICATE")) return token;
  return `-----BEGIN CERTIFICATE-----\n${token.replace(/\s/g, "").match(/.{1,64}/g)?.join("\n") ?? token}\n-----END CERTIFICATE-----`;
};

export async function POST(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { integrationId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration || integration.connector !== "zatca") {
    return NextResponse.json({ error: "ZATCA integration not found" }, { status: 404 });
  }
  const membership = await requireCompanyRole(user.id, integration.companyId, ["owner", "admin"]);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action) as Action;
  const client = new ZatcaApiClient({ environment: integration.environment, timeout: 30000 });
  const currentCredentials = integration.credentials ?? {};
  const rootConfig = integration.config ?? {};
  const config = rootConfig.mapping && typeof rootConfig.mapping === "object" && !Array.isArray(rootConfig.mapping)
    ? { ...rootConfig, ...(rootConfig.mapping as Record<string, unknown>) }
    : rootConfig;

  try {
    if (action === "compliance-csid") {
      const company = await getCompanyById(integration.companyId);
      if (!company?.vatNumber || !company.crNumber) {
        throw new Error("Company VAT and commercial registration numbers are required.");
      }
      const sellerAddress = config.sellerAddress && typeof config.sellerAddress === "object"
        ? config.sellerAddress as Record<string, unknown>
        : {};
      const csr = generateCSR({
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
      }, integration.environment);
      const result = await client.requestComplianceCSID(csr.csr, text(body.otp));
      if (result.status !== "ACCEPTED") throw new Error(result.error?.message || "Compliance CSID rejected.");
      await updateIntegration(integration.id, {
        credentials: {
          ...currentCredentials,
          privateKeyPem: csr.privateKey,
          publicKeyPem: csr.publicKey,
          complianceToken: result.binarySecurityToken,
          complianceSecret: result.secret,
          complianceCertificatePem: certificatePem(result.binarySecurityToken),
          complianceRequestId: result.requestId,
        },
        config: { ...rootConfig, onboardingStatus: "compliance_csid_issued" },
      });
    } else if (action === "verify-compliance") {
      const invoice = await getSalesInvoiceById(text(body.invoiceId));
      if (!invoice || invoice.companyId !== integration.companyId) throw new Error("A valid company invoice is required.");
      const token = text(currentCredentials.complianceToken);
      const secret = text(currentCredentials.complianceSecret);
      const privateKeyPem = text(currentCredentials.privateKeyPem);
      const cert = text(currentCredentials.complianceCertificatePem) || certificatePem(token);
      if (!token || !secret || !privateKeyPem) throw new Error("Request a compliance CSID first.");
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
            ...(subtype === "0100000" && !base.customer ? {
              customer: {
                name: text(config.complianceBuyerName) || "Compliance Buyer",
                vatNumber: text(config.complianceBuyerVatNumber) || companyVatFallback(base.supplier.vatNumber),
                address: base.supplier.address,
              },
            } : {}),
          } as InvoiceData;
          const isCredit = code === "381";
          const xml = isCredit
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
      if (checks.some((check) => !check.valid)) {
        return NextResponse.json({ ok: false, checks }, { status: 422 });
      }
      await updateIntegration(integration.id, {
        config: { ...rootConfig, onboardingStatus: "compliance_verified", complianceVerifiedAt: new Date().toISOString() },
      });
      return NextResponse.json({ ok: true, checks });
    } else if (action === "production-csid") {
      if (config.onboardingStatus !== "compliance_verified") throw new Error("All compliance checks must pass first.");
      const token = text(currentCredentials.complianceToken);
      const secret = text(currentCredentials.complianceSecret);
      const requestId = text(currentCredentials.complianceRequestId);
      const result = await client.requestProductionCSID({ binarySecurityToken: token, secret }, requestId);
      if (result.status !== "ACCEPTED") throw new Error(result.error?.message || "Production CSID rejected.");
      await updateIntegration(integration.id, {
        credentials: {
          ...currentCredentials,
          binarySecurityToken: result.binarySecurityToken,
          secret: result.secret,
          certificatePem: certificatePem(result.binarySecurityToken),
        },
        config: { ...rootConfig, onboardingStatus: "production_ready", productionCsidIssuedAt: new Date().toISOString() },
        status: "active",
      });
    } else {
      return NextResponse.json({ error: "Unsupported onboarding action" }, { status: 400 });
    }

    await recordAuditEvent({
      companyId: integration.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: `integration.zatca.${action}`,
      entity: "integration",
      entityId: integration.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ZATCA onboarding failed" }, { status: 400 });
  }
}

function companyVatFallback(vat: string) {
  return vat === "300000000000003" ? "310000000000003" : "300000000000003";
}
