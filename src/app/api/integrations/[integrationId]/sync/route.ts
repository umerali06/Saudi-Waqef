import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getIntegrationById, updateIntegration } from "@/lib/data/integrations";
import {
  createIntegrationJob,
  getRunningIntegrationJob,
  updateIntegrationJob,
} from "@/lib/data/integration-jobs";
import { createIntegrationLog } from "@/lib/data/integration-logs";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { buildRequestPayload, executeIntegrationRequest } from "@/lib/integrations/runtime";
import { validateIntegrationReadiness } from "@/lib/integrations/validation";
import {
  createZatcaArtifact,
  getZatcaArtifactByUuid,
  updateZatcaArtifactStatus,
} from "@/lib/data/zatca-artifacts";
import { normalizeZatcaResults } from "@/lib/integrations/zatca/response-normalization";
import { normalizeGosiResults } from "@/lib/integrations/gosi/response-normalization";
import { normalizeMudadResults } from "@/lib/integrations/mudad/response-normalization";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { integrationId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, integration.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const readiness = await validateIntegrationReadiness(integration);
  if (!readiness.ok) {
    const message = readiness.errors.join(" ");
    return NextResponse.json({ ok: false, message, readiness }, { status: 400 });
  }

  const runningJob = await getRunningIntegrationJob({
    integrationId,
    type: "sync",
  });
  if (runningJob) {
    return NextResponse.json(
      {
        ok: false,
        message: "A sync job is already running for this integration.",
        runningJobId: runningJob.id,
      },
      { status: 409 }
    );
  }

  const jobId = await createIntegrationJob({
    companyId: integration.companyId,
    integrationId,
    type: "sync",
    status: "running",
    attempts: 1,
  });

  let ok = false;
  let message = "Sync failed.";
  let details: Record<string, unknown> | undefined;

  try {
    const result = await executeIntegrationRequest({
      integration,
      mode: "sync",
      correlationId: jobId,
    });
    ok = result.ok;
    message = result.ok
      ? `Sync completed with HTTP ${result.status}.`
      : `Sync failed with HTTP ${result.status}.`;
    details = {
      status: result.status,
      statusText: result.statusText,
      requestUrl: result.requestUrl,
      bodyPreview: result.bodyPreview,
      durationMs: result.durationMs,
      attempt: result.attempt,
      callback: result.callback ?? null,
    };
    await updateIntegration(integrationId, {
      status: result.ok ? "active" : "error",
      lastSyncAt: result.ok ? new Date() : null,
      lastError: result.ok ? null : message,
    });
    await updateIntegrationJob(jobId, {
      status: result.ok ? "success" : "failed",
      lastError: result.ok ? null : message,
      finishedAt: new Date(),
    });

    if (result.ok && integration.connector === "zatca") {
      const parsedRows = normalizeZatcaResults(
        result.bodyJson
      );
      const byUuid = new Map(parsedRows.map((row) => [row.uuid, row]));
      const counts = parsedRows.reduce(
        (acc, row) => {
          acc[row.status] += 1;
          return acc;
        },
        { accepted: 0, rejected: 0, submitted: 0 }
      );
      const payload = (await buildRequestPayload(integration)) as {
        invoices?: Array<Record<string, unknown>>;
      };
      const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
      for (const invoice of invoices) {
        const uuid =
          typeof invoice.uuid === "string" && invoice.uuid.trim() ? invoice.uuid.trim() : "";
        const sourceInvoiceId =
          typeof invoice.sourceInvoiceId === "string" && invoice.sourceInvoiceId.trim()
            ? invoice.sourceInvoiceId.trim()
            : "";
        if (!uuid || !sourceInvoiceId) {
          continue;
        }

        const existingArtifact = await getZatcaArtifactByUuid(integration.companyId, uuid);
        const providerResult = byUuid.get(uuid);
        const artifactStatus = providerResult?.status ?? "submitted";
        const providerReference = providerResult?.providerReference ?? jobId;
        const providerMessage = providerResult?.message ?? null;
        const providerRaw = providerResult?.raw ?? null;

        if (existingArtifact) {
          await updateZatcaArtifactStatus(existingArtifact.id, {
            status: artifactStatus,
            providerReference,
            lastSubmittedAt: new Date(),
            lastResponse: {
              phase: "sync_submission",
              requestUrl: result.requestUrl,
              status: result.status,
              providerMessage,
              providerRaw,
            },
          });
          continue;
        }

        const hash = typeof invoice.hash === "string" ? invoice.hash : "";
        const qr = typeof invoice.qr === "string" ? invoice.qr : "";
        if (!hash || !qr) {
          continue;
        }

        const artifactId = await createZatcaArtifact({
          companyId: integration.companyId,
          invoiceId: sourceInvoiceId,
          uuid,
          hash,
          qr,
          payload: invoice,
          status: artifactStatus,
          environment: integration.environment,
          documentType: invoice.profileId === "reporting:1.0" ? "simplified" : "standard",
          operation: invoice.profileId === "reporting:1.0" ? "reporting" : "clearance",
        });
        await updateZatcaArtifactStatus(artifactId, {
          providerReference,
          lastSubmittedAt: new Date(),
          lastResponse: {
            phase: "sync_submission",
            requestUrl: result.requestUrl,
            status: result.status,
            providerMessage,
            providerRaw,
          },
        });
      }

      details = {
        ...(details ?? {}),
        artifactStatusSummary: counts,
      };
    }

    if (result.ok && integration.connector === "gosi") {
      const parsedRows = normalizeGosiResults(result.bodyJson);
      const counts = parsedRows.reduce(
        (acc, row) => {
          acc[row.status] += 1;
          return acc;
        },
        { accepted: 0, rejected: 0, submitted: 0 }
      );
      details = {
        ...(details ?? {}),
        gosiSummary: {
          total: parsedRows.length,
          counts,
        },
      };
    }

    if (result.ok && integration.connector === "mudad") {
      const parsedRows = normalizeMudadResults(result.bodyJson);
      const counts = parsedRows.reduce(
        (acc, row) => {
          acc[row.status] += 1;
          return acc;
        },
        { accepted: 0, rejected: 0, submitted: 0 }
      );
      details = {
        ...(details ?? {}),
        mudadSummary: {
          total: parsedRows.length,
          counts,
        },
      };
    }
  } catch (error) {
    message = error instanceof Error ? error.message : "Sync failed.";
    details = { error: message };
    await updateIntegration(integrationId, {
      status: "error",
      lastError: message,
    });
    await updateIntegrationJob(jobId, {
      status: "failed",
      lastError: message,
      finishedAt: new Date(),
    });
  }

  await createIntegrationLog({
    companyId: integration.companyId,
    integrationId,
    level: ok ? "info" : "error",
    message,
    metadata: { jobId, ...(details ?? {}) },
  });

  await recordAuditEvent({
    companyId: integration.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.sync",
    entity: "integration",
    entityId: integrationId,
    metadata: { jobId, ok, ...(details ?? {}) },
  });

  return NextResponse.json({ jobId, ok, message, details }, { status: ok ? 200 : 400 });
}
