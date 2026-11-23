import { listAllActiveZatcaIntegrations } from "@/lib/data/integrations";
import { listAtRiskReportingArtifacts, updateZatcaArtifactStatus } from "@/lib/data/zatca-artifacts";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { executeZatcaSubmission } from "@/lib/integrations/zatca/service";
import { checkZatcaIntegrationHealth } from "@/lib/integrations/zatca/health";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { logger } from "@/lib/ops/logger";

/**
 * Alert once a B2C (reporting) document is within this window of its 24h
 * ZATCA deadline. Vercel's Hobby plan only allows cron jobs to run once per
 * day (see vercel.json), so this job only gets one shot every ~24h -- the
 * window is set to 26h (24h + a buffer) rather than a tight few hours, so an
 * artifact due before the *next* run is still caught on *this* run. If this
 * job is ever moved to a shorter interval (e.g. after upgrading to Vercel
 * Pro), shrink this back down to a few hours for tighter, less noisy alerts.
 */
const WARNING_WINDOW_MS = 26 * 60 * 60 * 1000;

/**
 * There is currently no other scheduled trigger anywhere in this app that
 * submits pending invoices to ZATCA -- only a manual "Sync Now" click does.
 * This job does double duty: it first attempts a catch-up submission for
 * every active integration (so real invoices don't silently miss their
 * deadline for lack of a trigger), then alerts only on what's still
 * genuinely at risk after that attempt.
 */
export async function runZatcaReportingSlaCheck() {
  const integrations = await listAllActiveZatcaIntegrations();
  const summary = {
    integrationsChecked: integrations.length,
    submissionErrors: 0,
    atRisk: 0,
    breached: 0,
    alerted: 0,
    healthAlerts: 0,
  };

  for (const integration of integrations) {
    try {
      await executeZatcaSubmission(integration);
    } catch (error) {
      summary.submissionErrors += 1;
      logger.warn("ZATCA reporting-SLA cron: catch-up submission failed for an integration", {
        integrationId: integration.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Health is evaluated after the catch-up attempt so a queue that just
  // drained is not reported as stalled.
  for (const integration of integrations) {
    try {
      const health = await checkZatcaIntegrationHealth(integration);
      summary.healthAlerts += health.fired.length;
    } catch (error) {
      logger.warn("ZATCA reporting-SLA cron: health check failed for an integration", {
        integrationId: integration.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // The catch-up run above resubmits under the same UUID, and ZATCA answers 409
  // for documents it already holds, so anything it accepted is settled by now.
  const liveEnvironments = new Set(
    integrations.map((integration) => `${integration.companyId}:${integration.environment}`)
  );
  const atRiskArtifacts = (await listAtRiskReportingArtifacts(WARNING_WINDOW_MS)).filter(
    (artifact) =>
      artifact.environment !== "sandbox" &&
      liveEnvironments.has(`${artifact.companyId}:${artifact.environment}`)
  );

  for (const artifact of atRiskArtifacts) {
    const dueAt = artifact.reportingDueAt;
    const breached = Boolean(dueAt && dueAt.getTime() <= Date.now());
    if (breached) summary.breached += 1;
    else summary.atRisk += 1;

    const invoice = await getSalesInvoiceById(artifact.invoiceId).catch(() => null);
    await notifyCompanyRoles({
      companyId: artifact.companyId,
      roles: ["owner", "admin"],
      type: breached ? "zatca_reporting_sla_breached" : "zatca_reporting_sla_risk",
      data: {
        invoiceNumber: invoice?.invoiceNumber ?? artifact.uuid,
        dueDate: dueAt ? dueAt.toISOString() : "",
      },
    });
    await updateZatcaArtifactStatus(artifact.id, { slaAlertedAt: new Date() });
    summary.alerted += 1;
  }

  return summary;
}
