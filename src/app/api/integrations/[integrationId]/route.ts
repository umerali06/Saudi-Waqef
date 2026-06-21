import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess, requireCompanyRole } from "@/lib/access";
import { integrationUpdateSchema } from "@/lib/validators/integrations";
import { getIntegrationById, updateIntegration } from "@/lib/data/integrations";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

const sanitizeIntegration = (integration: {
  id: string;
  companyId: string;
  name: string;
  connector: string;
  status: string;
  environment: string;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  lastSyncAt?: Date;
  lastError?: string | null;
  createdAt: Date;
  updatedAt?: Date;
}) => ({
  id: integration.id,
  companyId: integration.companyId,
  name: integration.name,
  connector: integration.connector,
  status: integration.status,
  environment: integration.environment,
  config: integration.config ?? {},
  credentialsSet: Boolean(
    integration.credentials && Object.keys(integration.credentials).length > 0
  ),
  lastSyncAt: integration.lastSyncAt ? integration.lastSyncAt.toISOString() : null,
  lastError: integration.lastError ?? null,
  createdAt: integration.createdAt.toISOString(),
  updatedAt: integration.updatedAt ? integration.updatedAt.toISOString() : null,
});

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { integrationId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAdminAccess(user.id, integration.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ integration: sanitizeIntegration(integration) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { integrationId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = integrationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, integration.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await updateIntegration(integrationId, {
    ...parsed.data,
    ...(parsed.data.config ? { config: { ...(integration.config ?? {}), ...parsed.data.config } } : {}),
    ...(parsed.data.credentials ? {
      credentials: { ...(integration.credentials ?? {}), ...parsed.data.credentials },
    } : {}),
  });

  await recordAuditEvent({
    companyId: integration.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.update",
    entity: "integration",
    entityId: integrationId,
    metadata: {
      ...parsed.data,
      ...(parsed.data.credentials ? { credentials: "[REDACTED]" } : {}),
    },
  });

  const updated = await getIntegrationById(integrationId);
  return NextResponse.json({
    integration: updated ? sanitizeIntegration(updated) : null,
  });
}

export async function DELETE(_: Request, context: RouteContext) {
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

  await updateIntegration(integrationId, { status: "inactive" });

  await recordAuditEvent({
    companyId: integration.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.deactivate",
    entity: "integration",
    entityId: integrationId,
    metadata: { connector: integration.connector, name: integration.name },
  });

  return NextResponse.json({ ok: true });
}

