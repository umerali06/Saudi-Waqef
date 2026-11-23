import { parseCertificate } from "@/lib/integrations/zatca/certificate";
import { listAllActiveZatcaIntegrations, updateIntegration } from "@/lib/data/integrations";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { logger } from "@/lib/ops/logger";

/** Ascending so the *tightest* crossed tier is picked first. */
const ALERT_TIERS = [1, 7, 14, 30] as const;

/**
 * Scans every active ZATCA integration (cross-tenant -- see
 * listAllActiveZatcaIntegrations's own restriction comment) and alerts the
 * company's owner/admin once per expiry tier (30/14/7/1 days) plus once on
 * actual expiry .
 */
export async function runZatcaCertificateExpiryCheck() {
  const integrations = await listAllActiveZatcaIntegrations();
  const summary = { checked: integrations.length, alerted: 0, expired: 0, errors: 0 };

  for (const integration of integrations) {
    // Certificates saved before the token was decoded correctly are not valid
    // PEM, so the PEM is always rebuilt from the token when there is one.
    const stored = integration.credentials?.binarySecurityToken ?? integration.credentials?.certificatePem;
    if (typeof stored !== "string" || !stored.trim()) continue;

    try {
      const info = parseCertificate(stored);
      if (info.daysUntilExpiry > 30) continue;
      const lastAlertedTier =
        typeof integration.config?.zatcaCertExpiryLastAlertTier === "number"
          ? (integration.config.zatcaCertExpiryLastAlertTier as number)
          : null;

      if (info.isExpired) {
        if (integration.lastError !== "ZATCA_CERTIFICATE_EXPIRED") {
          await updateIntegration(integration.id, {
            status: "error",
            lastError: "ZATCA_CERTIFICATE_EXPIRED",
          });
          await notifyCompanyRoles({
            companyId: integration.companyId,
            roles: ["owner", "admin"],
            type: "zatca_certificate_expired",
            data: { expiryDate: info.validTo },
          });
          summary.expired += 1;
        }
        continue;
      }

      const tier = ALERT_TIERS.find((candidate) => info.daysUntilExpiry <= candidate);
      if (tier !== undefined && tier !== lastAlertedTier) {
        await notifyCompanyRoles({
          companyId: integration.companyId,
          roles: ["owner", "admin"],
          type: "zatca_certificate_expiring",
          data: { daysUntilExpiry: String(info.daysUntilExpiry), expiryDate: info.validTo },
        });
        await updateIntegration(integration.id, {
          config: { zatcaCertExpiryLastAlertTier: tier },
        });
        summary.alerted += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.error("ZATCA certificate expiry check failed for an integration", {
        integrationId: integration.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
