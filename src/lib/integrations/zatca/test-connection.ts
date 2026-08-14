import crypto from "crypto";
import { ZatcaApiClient } from "@talha7k/zatca";
import type { IntegrationRecord } from "@/lib/data/integrations";
import { getCompanyById } from "@/lib/data/companies";
import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";
import { buildZatcaSupplierInfo } from "@/lib/integrations/zatca/company-info";
import { buildAndSignComplianceScenario } from "@/lib/integrations/zatca/compliance-scenarios";

type IntegrationResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  bodyPreview: string;
  bodyJson: unknown | null;
  requestUrl: string;
  durationMs: number;
  attempt: number;
  responseHeaders: Record<string, string>;
  callback?: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    statusText?: string;
    error?: string;
  };
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Runs a real, safe connectivity check against ZATCA without ever fabricating
 * an invoice into the live, sequential hash chain:
 *  - Still in sandbox/testing: exercise the full sign + compliance-verify
 *    pipeline with one fresh, repeatable STANDARD_INVOICE compliance scenario.
 *  - Production: check the status of the most recently submitted real
 *    document (or a synthetic UUID if none exist yet) -- a genuine auth +
 *    reachability check with no fabricated document.
 */
export async function runZatcaTestConnection(integration: IntegrationRecord): Promise<IntegrationResponse> {
  const config = integration.config ?? {};
  const onboardingStatus = typeof config.onboardingStatus === "string" ? config.onboardingStatus : "";
  const company = await getCompanyById(integration.companyId);
  if (!company) {
    throw new Error("Company not found for ZATCA test connection.");
  }

  const startedAt = Date.now();
  const client = new ZatcaApiClient({ environment: integration.environment, timeout: 30000 });
  const credentials = integration.credentials ?? {};

  if (onboardingStatus === "production_ready") {
    const token = text(credentials.binarySecurityToken);
    const secret = text(credentials.secret);
    if (!token || !secret) {
      throw new Error("Production CSID credentials are required to test the connection.");
    }
    const artifacts = await listZatcaArtifactsByCompany(integration.companyId, 1);
    const uuid = artifacts[0]?.uuid ?? crypto.randomUUID();
    const result = await client.checkInvoiceStatus({ binarySecurityToken: token, secret }, uuid);
    return {
      ok: true,
      status: 200,
      statusText: `ZATCA status: ${result.status}`,
      bodyPreview: JSON.stringify(result).slice(0, 2000),
      bodyJson: result,
      requestUrl: `zatca://${integration.environment}/invoices/status/${uuid}`,
      durationMs: Date.now() - startedAt,
      attempt: 1,
      responseHeaders: {},
    };
  }

  const complianceToken = text(credentials.complianceToken);
  const complianceSecret = text(credentials.complianceSecret);
  const privateKeyPem = text(credentials.privateKeyPem);
  const certificatePem = text(credentials.complianceCertificatePem);
  if (!complianceToken || !complianceSecret || !privateKeyPem || !certificatePem) {
    throw new Error("Complete identity verification before testing the connection.");
  }

  const supplier = buildZatcaSupplierInfo(company, config);
  const scenario = buildAndSignComplianceScenario("STANDARD_INVOICE", {
    supplier,
    privateKeyPem,
    certificatePem,
  });
  const verification = await client.verifyCompliance(
    { binarySecurityToken: complianceToken, secret: complianceSecret },
    scenario.invoiceHash,
    scenario.uuid,
    Buffer.from(scenario.signedXml).toString("base64")
  );

  return {
    ok: verification.valid,
    status: verification.valid ? 200 : 422,
    statusText: verification.valid ? "Accepted by ZATCA" : "Rejected by ZATCA",
    bodyPreview: JSON.stringify(verification).slice(0, 2000),
    bodyJson: verification,
    requestUrl: `zatca://${integration.environment}/compliance/invoices`,
    durationMs: Date.now() - startedAt,
    attempt: 1,
    responseHeaders: {},
  };
}
