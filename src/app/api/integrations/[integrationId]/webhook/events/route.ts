import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { listWebhookEventsByIntegration } from "@/lib/data/integration-webhook-events";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
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

  const { searchParams } = new URL(request.url);
  const eventIdContains = searchParams.get("eventId")?.trim() ?? "";
  const failedOnly =
    ["1", "true", "yes"].includes(
      (searchParams.get("failedOnly") ?? "").trim().toLowerCase()
    );

  const events = await listWebhookEventsByIntegration(integrationId, 50, {
    eventIdContains: eventIdContains || undefined,
    failedOnly,
  });
  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id,
      integrationId: event.integrationId,
      timestamp: event.timestamp,
      processedAt: event.processedAt ? event.processedAt.toISOString() : null,
      replayCount: event.replayCount ?? 0,
      lastReplayAt: event.lastReplayAt ? event.lastReplayAt.toISOString() : null,
      lastResult: event.lastResult ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
  });
}
