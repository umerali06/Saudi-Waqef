import { NextResponse } from "next/server";
import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";
import { getZatcaIntegrationForCompany } from "@/lib/integrations/zatca/onboarding";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:accounting", "write:accounting"], async ({
    companyId,
  }) => {
    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get("integrationId") ?? "";
    if (!integrationId) {
      return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
    }

    const integration = await getZatcaIntegrationForCompany({ integrationId, companyId });
    const artifacts = await listZatcaArtifactsByCompany(companyId, 50);

    return NextResponse.json({
      data: {
        integrationId: integration.id,
        environment: integration.environment,
        status: integration.status,
        onboardingStatus: integration.config?.onboardingStatus ?? "not_started",
        lastSyncAt: integration.lastSyncAt ?? null,
        lastError: integration.lastError ?? null,
        artifacts: artifacts.map((artifact) => ({
          id: artifact.id,
          invoiceId: artifact.invoiceId,
          uuid: artifact.uuid,
          status: artifact.status,
          providerReference: artifact.providerReference,
          lastSubmittedAt: artifact.lastSubmittedAt,
          lastResponse: artifact.lastResponse,
        })),
      },
    });
  });
}
