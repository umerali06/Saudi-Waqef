import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";
import { updateIntegration, type IntegrationRecord } from "@/lib/data/integrations";
import { notifyCompanyRoles } from "@/lib/notifications/service";

const HOUR_MS = 60 * 60 * 1000;
const REJECTION_WINDOW_MS = 24 * HOUR_MS;
const REJECTION_THRESHOLD = 3;
/** A document still unsent this long after issuance means the queue is not draining. */
const STALLED_AFTER_MS = 12 * HOUR_MS;
const STALLED_THRESHOLD = 1;
/** Don't re-alert on the same condition more often than this. */
const ALERT_COOLDOWN_MS = 24 * HOUR_MS;

const alertedRecently = (value: unknown) => {
  if (typeof value !== "string") return false;
  const at = new Date(value).getTime();
  return Number.isFinite(at) && Date.now() - at < ALERT_COOLDOWN_MS;
};

/**
 * Operational health for one ZATCA integration: repeated rejections, a queue
 * that stopped draining, and an integration halted by an error (lock loss,
 * expired certificate, failed authentication). Certificate expiry and the 24h
 * B2C reporting SLA are covered by their own jobs.
 */
export async function checkZatcaIntegrationHealth(integration: IntegrationRecord) {
  const config = integration.config ?? {};
  const artifacts = await listZatcaArtifactsByCompany(integration.companyId, 500);
  const now = Date.now();
  const fired: string[] = [];
  const configPatch: Record<string, unknown> = {};

  if (integration.status === "error" && integration.lastError) {
    if (!alertedRecently(config.zatcaUnhealthyAlertedAt)) {
      await notifyCompanyRoles({
        companyId: integration.companyId,
        roles: ["owner", "admin"],
        type: "zatca_integration_unhealthy",
        data: { reason: integration.lastError },
      });
      configPatch.zatcaUnhealthyAlertedAt = new Date().toISOString();
      fired.push("unhealthy");
    }
  } else if (config.zatcaUnhealthyAlertedAt) {
    configPatch.zatcaUnhealthyAlertedAt = null;
  }

  const rejected = artifacts.filter(
    (artifact) =>
      artifact.status === "rejected" &&
      (artifact.lastSubmittedAt ?? artifact.createdAt).getTime() >= now - REJECTION_WINDOW_MS
  );
  if (rejected.length >= REJECTION_THRESHOLD) {
    if (!alertedRecently(config.zatcaRejectionAlertedAt)) {
      await notifyCompanyRoles({
        companyId: integration.companyId,
        roles: ["owner", "admin"],
        type: "zatca_rejection_spike",
        data: {
          rejectedCount: String(rejected.length),
          windowHours: String(REJECTION_WINDOW_MS / HOUR_MS),
        },
      });
      configPatch.zatcaRejectionAlertedAt = new Date().toISOString();
      fired.push("rejection_spike");
    }
  } else if (config.zatcaRejectionAlertedAt) {
    configPatch.zatcaRejectionAlertedAt = null;
  }

  const stalled = artifacts.filter(
    (artifact) =>
      (artifact.status === "pending" || artifact.status === "submitted") &&
      artifact.createdAt.getTime() <= now - STALLED_AFTER_MS
  );
  if (stalled.length >= STALLED_THRESHOLD) {
    if (!alertedRecently(config.zatcaStalledAlertedAt)) {
      const oldest = stalled.reduce(
        (min, artifact) => Math.min(min, artifact.createdAt.getTime()),
        now
      );
      await notifyCompanyRoles({
        companyId: integration.companyId,
        roles: ["owner", "admin"],
        type: "zatca_submission_stalled",
        data: {
          pendingCount: String(stalled.length),
          oldestHours: String(Math.floor((now - oldest) / HOUR_MS)),
        },
      });
      configPatch.zatcaStalledAlertedAt = new Date().toISOString();
      fired.push("stalled");
    }
  } else if (config.zatcaStalledAlertedAt) {
    configPatch.zatcaStalledAlertedAt = null;
  }

  if (Object.keys(configPatch).length) {
    await updateIntegration(integration.id, { config: { ...config, ...configPatch } });
  }

  return { integrationId: integration.id, fired };
}
