import type { IntegrationRecord } from "@/lib/data/integrations";
import { getCompanyById } from "@/lib/data/companies";

export type IntegrationValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const endpointValues = (integration: IntegrationRecord) => {
  const rootConfig = integration.config ?? {};
  const config = rootConfig.mapping && typeof rootConfig.mapping === "object" && !Array.isArray(rootConfig.mapping)
    ? { ...rootConfig, ...(rootConfig.mapping as Record<string, unknown>) }
    : rootConfig;
  return [config.endpoint, config.testEndpoint, config.syncEndpoint]
    .map(trim)
    .filter(Boolean);
};

const isPrivateHostname = (hostname: string) => {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value === "::1" || value.endsWith(".local")) return true;
  if (/^127\./.test(value) || /^10\./.test(value) || /^169\.254\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  const match = value.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
};

const hasEndpoint = (integration: IntegrationRecord) => {
  const rootConfig = integration.config ?? {};
  const config = rootConfig.mapping && typeof rootConfig.mapping === "object" && !Array.isArray(rootConfig.mapping)
    ? { ...rootConfig, ...(rootConfig.mapping as Record<string, unknown>) }
    : rootConfig;
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

  if (integration.connector !== "zatca" && !hasEndpoint(integration)) {
    errors.push("Integration endpoint is missing (endpoint/testEndpoint/syncEndpoint).");
  }

  for (const endpoint of integration.connector === "zatca" ? [] : endpointValues(integration)) {
    try {
      const url = new URL(endpoint);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push(`Integration endpoint must use HTTP or HTTPS: ${endpoint}`);
      }
      if (integration.environment === "production" && url.protocol !== "https:") {
        errors.push(`Production integration endpoints must use HTTPS: ${endpoint}`);
      }
      if (integration.environment === "production" && isPrivateHostname(url.hostname)) {
        errors.push(`Production integration endpoints cannot target a private host: ${endpoint}`);
      }
    } catch {
      errors.push(`Integration endpoint is not a valid absolute URL: ${endpoint}`);
    }
  }

  if (integration.connector !== "zatca" && (authType === "bearer" || authType === "api_key")) {
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
  const rootConfig = integration.config ?? {};
  const config = rootConfig.mapping && typeof rootConfig.mapping === "object" && !Array.isArray(rootConfig.mapping)
    ? { ...rootConfig, ...(rootConfig.mapping as Record<string, unknown>) }
    : rootConfig;

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
  const credentialIssues = [
    ["binarySecurityToken", "ZATCA production CSID token is not configured."],
    ["secret", "ZATCA production CSID secret is not configured."],
    ["certificatePem", "ZATCA certificate PEM is not configured."],
    ["privateKeyPem", "ZATCA private key PEM is not configured."],
  ] as const;
  for (const [key, message] of credentialIssues) {
    if (!trim(credentials[key])) {
      (integration.environment === "production" ? errors : warnings).push(message);
    }
  }
  const address = config.sellerAddress;
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    errors.push("Structured ZATCA seller address is required.");
  }
  if (integration.environment === "production" && config.onboardingStatus !== "production_ready") {
    errors.push("ZATCA compliance verification and production CSID onboarding must be completed.");
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
