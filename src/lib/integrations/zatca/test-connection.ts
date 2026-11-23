import type { IntegrationRecord } from "@/lib/data/integrations";
import { getCompanyById } from "@/lib/data/companies";
import { ZatcaApi } from "@/lib/integrations/zatca/api";
import { buildZatcaSupplierInfo } from "@/lib/integrations/zatca/company-info";
import { buildAndSignComplianceScenario } from "@/lib/integrations/zatca/compliance-scenarios";
import { toSubmissionBody } from "@/lib/integrations/zatca/document";
import { mergedZatcaConfig } from "@/lib/integrations/zatca/mapping";

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
 * Exercises authentication, signing and ZATCA's validation rules with one
 * compliance document. The compliance endpoint validates without filing, so it
 * is safe in every environment and never touches the invoice hash chain.
 */
export async function runZatcaTestConnection(
  integration: IntegrationRecord
): Promise<IntegrationResponse> {
  const config = mergedZatcaConfig(integration);
  const company = await getCompanyById(integration.companyId);
  if (!company) {
    throw new Error("Company not found for ZATCA test connection.");
  }

  const credentials = integration.credentials ?? {};
  const complianceToken = text(credentials.complianceToken);
  const complianceSecret = text(credentials.complianceSecret);
  const privateKeyPem = text(credentials.privateKeyPem);
  if (!complianceToken || !complianceSecret || !privateKeyPem) {
    throw new Error("Complete identity verification before testing the connection.");
  }

  const startedAt = Date.now();
  const signed = buildAndSignComplianceScenario(
    text(config.invoiceType) === "0100" ? "SIMPLIFIED_INVOICE" : "STANDARD_INVOICE",
    {
      supplier: buildZatcaSupplierInfo(company, config),
      privateKeyPem,
      certificate: complianceToken,
    }
  );
  const result = await new ZatcaApi(integration.environment).checkCompliance(
    { binarySecurityToken: complianceToken, secret: complianceSecret },
    toSubmissionBody(signed)
  );

  return {
    ok: result.valid,
    status: result.httpStatus,
    statusText: result.valid ? "Accepted by ZATCA" : "Rejected by ZATCA",
    bodyPreview: JSON.stringify(result).slice(0, 2000),
    bodyJson: result,
    requestUrl: `zatca://${integration.environment}/compliance/invoices`,
    durationMs: Date.now() - startedAt,
    attempt: 1,
    responseHeaders: {},
  };
}
