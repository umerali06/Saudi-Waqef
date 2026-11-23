/**
 * ZATCA runs three independent Fatoora environments. Credentials, hash chains
 * and submitted documents never carry over from one to another.
 *
 *  - sandbox     developer portal: public test OTP, documents have no legal effect
 *  - simulation  the taxpayer's own rehearsal environment (OTP from the Fatoora
 *                simulation portal), same validations as production
 *  - production  core portal: documents are legally filed
 */
export type ZatcaEnvironment = "sandbox" | "simulation" | "production";

const BASE_URLS: Record<ZatcaEnvironment, string> = {
  sandbox: "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",
  simulation: "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
  production: "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
};

export const zatcaBaseUrl = (environment: ZatcaEnvironment) => BASE_URLS[environment];

/** Config keys written only by the server; a settings form must never overwrite them. */
export const SERVER_MANAGED_ZATCA_CONFIG_KEYS = [
  "zatcaHashChain",
  "onboardingStatus",
  "complianceCsidIssuedAt",
  "complianceVerifiedAt",
  "complianceFailedAt",
  "complianceFailureDetail",
  "productionCsidIssuedAt",
  "certificateRenewedAt",
  "zatcaCertExpiryLastAlertTier",
  "zatcaUnhealthyAlertedAt",
  "zatcaRejectionAlertedAt",
  "zatcaStalledAlertedAt",
] as const;

export const withoutServerManagedConfig = (config: Record<string, unknown>) => {
  const copy = { ...config };
  for (const key of SERVER_MANAGED_ZATCA_CONFIG_KEYS) delete copy[key];
  return copy;
};
