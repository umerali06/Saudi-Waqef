import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getConnector } from "@/lib/integrations/registry";
import { getIntegrationById, updateIntegration } from "@/lib/data/integrations";
import { createIntegrationJob } from "@/lib/data/integration-jobs";
import { createIntegrationLog } from "@/lib/data/integration-logs";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

const validateCredentials = (connector: string, creds: Record<string, unknown>) => {
  const missing: string[] = [];
  if (connector === "zatca") {
    if (!creds.apiKey) missing.push("apiKey");
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

  await createIntegrationJob({
    companyId: integration.companyId,
    integrationId,
    type: "test",
    status: "queued",
  });

  const connector = getConnector(integration.connector);
  const missing = validateCredentials(
    integration.connector,
    integration.credentials ?? {}
  );

  const ok = !missing.length;
  const message = ok
    ? "Connection test passed."
    : `Missing credentials: ${missing.join(", ")}`;

  await updateIntegration(integrationId, {
    status: ok ? "active" : "error",
    lastError: ok ? null : message,
  });

  await createIntegrationLog({
    companyId: integration.companyId,
    integrationId,
    level: ok ? "info" : "error",
    message,
    metadata: {
      connector: integration.connector,
      supportsTest: connector?.supports.test ?? false,
    },
  });

  await recordAuditEvent({
    companyId: integration.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.test",
    entity: "integration",
    entityId: integrationId,
    metadata: { ok, message },
  });

  return NextResponse.json({ ok, message });
}
