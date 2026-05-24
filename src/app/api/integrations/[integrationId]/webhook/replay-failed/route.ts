import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { createIntegrationLog } from "@/lib/data/integration-logs";
import {
  listWebhookEventsByIntegration,
  updateWebhookEventResult,
} from "@/lib/data/integration-webhook-events";
import {
  getZatcaArtifactByUuid,
  updateZatcaArtifactStatus,
} from "@/lib/data/zatca-artifacts";
import { normalizeZatcaResults } from "@/lib/integrations/zatca/response-normalization";

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

  const failedEvents = await listWebhookEventsByIntegration(integrationId, 50, {
    failedOnly: true,
  });

  let eventsProcessed = 0;
  let artifactsUpdated = 0;
  let artifactsMissing = 0;

  for (const event of failedEvents) {
    const results = normalizeZatcaResults(event.payload ?? null);
    if (results.length === 0) {
      continue;
    }

    let updated = 0;
    let missing = 0;
    for (const result of results) {
      const artifact = await getZatcaArtifactByUuid(integration.companyId, result.uuid);
      if (!artifact) {
        missing += 1;
        continue;
      }
      await updateZatcaArtifactStatus(artifact.id, {
        status: result.status,
        providerReference: result.providerReference ?? null,
        lastSubmittedAt: new Date(),
        lastResponse: {
          message: result.message ?? null,
          raw: result.raw ?? null,
          replayedFromWebhookEventId: event.id,
          batchReplay: true,
        },
      });
      updated += 1;
    }

    await updateWebhookEventResult(event.id, {
      replayed: true,
      lastResult: {
        ok: true,
        replayedBy: user.id,
        updated,
        missing,
        total: results.length,
        batchReplay: true,
      },
    });

    eventsProcessed += 1;
    artifactsUpdated += updated;
    artifactsMissing += missing;
  }

  await createIntegrationLog({
    companyId: integration.companyId,
    integrationId,
    level: artifactsMissing > 0 ? "warn" : "info",
    message: `Batch webhook replay processed (${eventsProcessed} events, ${artifactsUpdated} updated, ${artifactsMissing} missing).`,
    metadata: {
      eventsProcessed,
      artifactsUpdated,
      artifactsMissing,
      replayedBy: user.id,
    },
  });

  return NextResponse.json({
    ok: true,
    eventsProcessed,
    artifactsUpdated,
    artifactsMissing,
  });
}

