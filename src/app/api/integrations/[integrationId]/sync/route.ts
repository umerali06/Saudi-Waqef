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
import { executeIntegrationRequest } from "@/lib/integrations/runtime";
import { validateIntegrationReadiness } from "@/lib/integrations/validation";
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
  let results: unknown[] | undefined;

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
      ...(result.ok ? { lastSyncAt: new Date() } : {}),
      lastError: result.ok ? null : message,
    });
    await updateIntegrationJob(jobId, {
      status: result.ok ? "success" : "failed",
      lastError: result.ok ? null : message,
      finishedAt: new Date(),
    });

    // ZATCA documents are signed, filed and recorded one by one by the ZATCA
    // service; here only the per-document outcome is passed on.
    if (integration.connector === "zatca") {
      results = (result.bodyJson as { results?: unknown[] } | null)?.results ?? [];
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

  return NextResponse.json({ jobId, ok, message, details, results }, { status: ok ? 200 : 400 });
}
