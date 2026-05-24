import type { IntegrationRecord } from "@/lib/data/integrations";
import { getCompanyById } from "@/lib/data/companies";

export type IntegrationValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const hasEndpoint = (integration: IntegrationRecord) => {
  const config = integration.config ?? {};
  const endpoint = trim(config.endpoint);
  const testEndpoint = trim(config.testEndpoint);
  const syncEndpoint = trim(config.syncEndpoint);
  return Boolean(endpoint || testEndpoint || syncEndpoint);
};

const validateCommon = (integration: IntegrationRecord) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = integration.config ?? {};
  const credentials = integration.credentials ?? {};
  const authType = trim(config.authType) || "bearer";

  if (!hasEndpoint(integration)) {
    errors.push("Integration endpoint is missing (endpoint/testEndpoint/syncEndpoint).");
  }

  if (authType === "bearer" || authType === "api_key") {
    if (!trim(credentials.apiKey)) {
      warnings.push("API key is not configured.");
    }
  }
  if (authType === "basic") {
    if (!trim(credentials.username) || !trim(credentials.password)) {
      warnings.push("Basic auth username/password are not fully configured.");
    }
  }

  return { errors, warnings };
};

const validateZatca = async (integration: IntegrationRecord) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const company = await getCompanyById(integration.companyId);
  const credentials = integration.credentials ?? {};

  if (!company) {
    errors.push("Company not found.");
    return { errors, warnings };
  }
  if (!trim(company.vatNumber)) {
    errors.push("Company VAT number is required for ZATCA integration.");
  }
  if (!trim(company.legalName) && !trim(company.name)) {
    errors.push("Company legal name is required for ZATCA integration.");
  }
  if (!trim(credentials.apiKey)) {
    warnings.push("ZATCA API key is not configured.");
  }
  if (!trim(credentials.certificatePem)) {
    warnings.push("ZATCA certificate PEM is not configured.");
  }
  if (!trim(credentials.privateKeyPem)) {
    warnings.push("ZATCA private key PEM is not configured.");
  }

  return { errors, warnings };
};

export async function validateIntegrationReadiness(
  integration: IntegrationRecord
): Promise<IntegrationValidationResult> {
  const common = validateCommon(integration);
  const errors = [...common.errors];
  const warnings = [...common.warnings];

  if (integration.connector === "zatca") {
    const zatca = await validateZatca(integration);
    errors.push(...zatca.errors);
    warnings.push(...zatca.warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
