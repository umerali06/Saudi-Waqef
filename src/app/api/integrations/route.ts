import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess, requireCompanyRole } from "@/lib/access";
import { integrationSchema } from "@/lib/validators/integrations";
import {
  createIntegration,
  listIntegrations,
} from "@/lib/data/integrations";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const integrations = await listIntegrations(companyId);
  return NextResponse.json({
    integrations: integrations.map((integration) => sanitizeIntegration(integration)),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = integrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const integrationId = await createIntegration({
    companyId: parsed.data.companyId,
    name: parsed.data.name,
    connector: parsed.data.connector,
    status: parsed.data.status,
    environment: parsed.data.environment,
    config: parsed.data.config ?? {},
    credentials: parsed.data.credentials ?? {},
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.create",
    entity: "integration",
    entityId: integrationId,
    metadata: { connector: parsed.data.connector, name: parsed.data.name },
  });

  return NextResponse.json({ integrationId });
}

