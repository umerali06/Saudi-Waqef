import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

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

  const artifacts = await listZatcaArtifactsByCompany(integration.companyId, 100);
  return NextResponse.json({
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      invoiceId: artifact.invoiceId,
      uuid: artifact.uuid,
      status: artifact.status ?? "pending",
      providerReference: artifact.providerReference ?? null,
      lastSubmittedAt: artifact.lastSubmittedAt ? artifact.lastSubmittedAt.toISOString() : null,
      lastResponse: artifact.lastResponse ?? null,
      createdAt: artifact.createdAt.toISOString(),
    })),
  });
}
