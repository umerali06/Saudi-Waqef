import { ZatcaApiClient } from "@talha7k/zatca";
import { listAllActiveZatcaIntegrations, type IntegrationRecord } from "@/lib/data/integrations";
import { listAtRiskReportingArtifacts, updateZatcaArtifactStatus } from "@/lib/data/zatca-artifacts";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { executeZatcaSubmission } from "@/lib/integrations/zatca/service";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { logger } from "@/lib/ops/logger";

/** Alert once a B2C (reporting) document is within 4h of its 24h ZATCA deadline. */
const WARNING_WINDOW_MS = 4 * 60 * 60 * 1000;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * There is currently no other scheduled trigger anywhere in this app that
 * submits pending invoices to ZATCA -- only a manual "Sync Now" click does.
 * This job does double duty: it first attempts a catch-up submission for
 * every active integration (so real invoices don't silently miss their
 * deadline for lack of a trigger), then alerts only on what's still
 * genuinely at risk after that attempt, reconciling against ZATCA's own
 * status API first in case it was actually accepted already.
 */
export async function runZatcaReportingSlaCheck() {
  const integrations = await listAllActiveZatcaIntegrations();
  const summary = {
    integrationsChecked: integrations.length,
    submissionErrors: 0,
    selfHealed: 0,
    atRisk: 0,
    breached: 0,
    alerted: 0,
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

  const integrationByCompany = new Map<string, IntegrationRecord>(
    integrations.map((integration) => [integration.companyId, integration])
  );
  const atRiskArtifacts = await listAtRiskReportingArtifacts(WARNING_WINDOW_MS);

  for (const artifact of atRiskArtifacts) {
    const integration = integrationByCompany.get(artifact.companyId);
    const token = text(integration?.credentials?.binarySecurityToken);
    const secret = text(integration?.credentials?.secret);

    let stillAtRisk = true;
    if (integration && token && secret) {
      try {
        const client = new ZatcaApiClient({ environment: integration.environment, timeout: 30000 });
        const status = await client.checkInvoiceStatus({ binarySecurityToken: token, secret }, artifact.uuid);
        if (["REPORTED", "ACCEPTED", "CLEARED"].includes(status.status)) {
          await updateZatcaArtifactStatus(artifact.id, { status: "accepted" });
          summary.selfHealed += 1;
          stillAtRisk = false;
        }
      } catch (error) {
        logger.warn("ZATCA reporting-SLA cron: status reconcile failed for an artifact", {
          artifactId: artifact.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!stillAtRisk) continue;

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
