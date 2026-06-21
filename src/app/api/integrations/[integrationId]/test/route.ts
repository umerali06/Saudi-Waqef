import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getConnector } from "@/lib/integrations/registry";
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

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

const validateCredentials = (connector: string, creds: Record<string, unknown>) => {
  const missing: string[] = [];
  if (connector === "zatca") {
    if (!creds.binarySecurityToken) missing.push("binarySecurityToken");
    if (!creds.secret) missing.push("secret");
    if (!creds.certificatePem) missing.push("certificatePem");
    if (!creds.privateKeyPem) missing.push("privateKeyPem");
  } else if (connector === "gosi" || connector === "mudad") {
    if (!creds.apiKey) missing.push("apiKey");
  }
  return missing;
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
    type: "test",
  });
  if (runningJob) {
    return NextResponse.json(
      {
        ok: false,
        message: "A test job is already running for this integration.",
        runningJobId: runningJob.id,
      },
      { status: 409 }
    );
  }

  const jobId = await createIntegrationJob({
    companyId: integration.companyId,
    integrationId,
    type: "test",
    status: "running",
    attempts: 1,
  });

  const connector = getConnector(integration.connector);
  const missing = validateCredentials(
    integration.connector,
    integration.credentials ?? {}
  );

  if (missing.length) {
    const message = `Missing credentials: ${missing.join(", ")}`;
    await updateIntegration(integrationId, {
      status: "error",
      lastError: message,
    });
    await updateIntegrationJob(jobId, {
      status: "failed",
      lastError: message,
    });
    await createIntegrationLog({
      companyId: integration.companyId,
      integrationId,
      level: "error",
      message,
      metadata: {
        connector: integration.connector,
        supportsTest: connector?.supports.test ?? false,
      },
    });
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  let ok = false;
  let message = "Connection test failed.";
  let details: Record<string, unknown> | undefined;

  try {
    const result = integration.connector === "zatca"
      ? await validateZatcaCertificate(integration)
      : await executeIntegrationRequest({
          integration,
          mode: "test",
          correlationId: jobId,
        });
    ok = result.ok;
    message = result.ok
      ? `Connection test passed with HTTP ${result.status}.`
      : `Connection test failed with HTTP ${result.status}.`;
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
      lastError: result.ok ? null : message,
    });
    await updateIntegrationJob(jobId, {
      status: result.ok ? "success" : "failed",
      lastError: result.ok ? null : message,
      finishedAt: new Date(),
    });
  } catch (error) {
    message = error instanceof Error ? error.message : "Connection test failed.";
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
    metadata: {
      connector: integration.connector,
      supportsTest: connector?.supports.test ?? false,
      ...(details ?? {}),
    },
  });

  await recordAuditEvent({
    companyId: integration.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.test",
    entity: "integration",
    entityId: integrationId,
    metadata: { ok, message, ...(details ?? {}) },
  });

  return NextResponse.json({ ok, message, details }, { status: ok ? 200 : 400 });
}

async function validateZatcaCertificate(integration: NonNullable<Awaited<ReturnType<typeof getIntegrationById>>>) {
  const { parseCertificate } = await import("@talha7k/zatca");
  const certificate = parseCertificate(String(integration.credentials?.certificatePem ?? ""));
  if (!certificate.isValid) throw new Error("ZATCA production certificate is expired or not yet valid.");
  return {
    ok: true,
    status: 200,
    statusText: "Certificate valid",
    requestUrl: `zatca://${integration.environment}/production-csid`,
    bodyPreview: JSON.stringify({
      issuer: certificate.issuer,
      serialNumber: certificate.serialNumber,
      validTo: certificate.validTo,
      daysUntilExpiry: certificate.daysUntilExpiry,
    }),
    durationMs: 0,
    attempt: 1,
    callback: undefined,
  };
}
