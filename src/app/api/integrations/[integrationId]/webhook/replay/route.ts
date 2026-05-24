import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { createIntegrationLog } from "@/lib/data/integration-logs";
import {
  getWebhookEventById,
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

const schema = z.object({
  eventId: z.string().trim().min(1),
});

export async function POST(request: Request, context: RouteContext) {
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

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = await getWebhookEventById(parsed.data.eventId);
  if (!event || event.integrationId !== integrationId) {
    return NextResponse.json({ error: "Webhook event not found" }, { status: 404 });
  }

  const results = normalizeZatcaResults(event.payload ?? null);
  if (results.length === 0) {
    return NextResponse.json(
      { error: "Webhook event has no replayable integration results" },
      { status: 400 }
    );
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
    },
  });

  await createIntegrationLog({
    companyId: integration.companyId,
    integrationId,
    level: missing > 0 ? "warn" : "info",
    message: `Webhook replay processed (${updated} updated, ${missing} missing).`,
    metadata: {
      eventId: event.id,
      replayedBy: user.id,
      updated,
      missing,
      total: results.length,
    },
  });

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    updated,
    missing,
    total: results.length,
  });
}

