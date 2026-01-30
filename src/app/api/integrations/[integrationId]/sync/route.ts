import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getIntegrationById, updateIntegration } from "@/lib/data/integrations";
import { createIntegrationJob } from "@/lib/data/integration-jobs";
import { createIntegrationLog } from "@/lib/data/integration-logs";
import { recordAuditEvent } from "@/lib/data/audit-log";

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

  const jobId = await createIntegrationJob({
    companyId: integration.companyId,
    integrationId,
    type: "sync",
    status: "queued",
  });

  await updateIntegration(integrationId, { lastSyncAt: new Date() });

  await createIntegrationLog({
    companyId: integration.companyId,
    integrationId,
    level: "info",
    message: "Sync queued.",
    metadata: { jobId },
  });

  await recordAuditEvent({
    companyId: integration.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.sync",
    entity: "integration",
    entityId: integrationId,
    metadata: { jobId },
  });

  return NextResponse.json({ jobId });
}
