import crypto from "crypto";
import { NextResponse } from "next/server";
import { getIntegrationById } from "@/lib/data/integrations";
import { createIntegrationLog } from "@/lib/data/integration-logs";
import {
  getZatcaArtifactByUuid,
  updateZatcaArtifactStatus,
} from "@/lib/data/zatca-artifacts";
import {
  registerWebhookEvent,
  updateWebhookEventResult,
} from "@/lib/data/integration-webhook-events";
import { normalizeZatcaResults } from "@/lib/integrations/zatca/response-normalization";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

const parseHeader = (value: string | null) => (value ? value.trim() : "");

const verifySignature = (params: {
  secret: string;
  timestamp: string;
  payload: string;
  signature: string;
}) => {
  const digest = crypto
    .createHmac("sha256", params.secret)
    .update(`${params.timestamp}.${params.payload}`)
    .digest("hex");

  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(params.signature, "utf8");
  if (expected.length !== received.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, received);
};

const toInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

export async function POST(request: Request, context: RouteContext) {
  const { integrationId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const credentials = integration.credentials ?? {};
  const primarySecret =
    (typeof credentials.webhookSecret === "string" && credentials.webhookSecret.trim()) || "";
  const previousSecret =
    (typeof credentials.webhookSecretPrevious === "string" &&
      credentials.webhookSecretPrevious.trim()) ||
    "";
  if (!primarySecret && !previousSecret) {
    return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 400 });
  }

  const timestamp = parseHeader(request.headers.get("x-integration-timestamp")) || "0";
  const signature = parseHeader(request.headers.get("x-integration-signature"));
  const incomingEventId = parseHeader(request.headers.get("x-integration-event-id"));
  if (!signature) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
  }

  const timestampNumber = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const toleranceSec = toInteger(integration.config?.webhookToleranceSec, 300);
  const boundedTolerance = Math.min(Math.max(toleranceSec, 30), 3600);
  if (!Number.isFinite(timestampNumber) || Math.abs(nowSeconds - timestampNumber) > boundedTolerance) {
    return NextResponse.json({ error: "Webhook timestamp is outside accepted window" }, { status: 401 });
  }

  const rawBody = await request.text();
  const signatureValid =
    (primarySecret
      ? verifySignature({
          secret: primarySecret,
          timestamp,
          payload: rawBody,
          signature,
        })
      : false) ||
    (previousSecret
      ? verifySignature({
          secret: previousSecret,
          timestamp,
          payload: rawBody,
          signature,
        })
      : false);
  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const fallbackEventId = crypto
    .createHash("sha256")
    .update(`${integrationId}:${timestamp}:${signature}:${rawBody}`)
    .digest("hex");
  const eventId = incomingEventId || fallbackEventId;
  let body: unknown;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const registered = await registerWebhookEvent({
    integrationId,
    eventId,
    timestamp,
    signature,
    payloadRaw: rawBody,
    payload: body && typeof body === "object" ? (body as Record<string, unknown>) : null,
  });
  if (!registered.created) {
    return NextResponse.json({ error: "Duplicate webhook event" }, { status: 409 });
  }

  const results = normalizeZatcaResults(body);
  if (results.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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
      },
    });
    updated += 1;
  }

  await createIntegrationLog({
    companyId: integration.companyId,
    integrationId,
    level: missing > 0 ? "warn" : "info",
    message: `Webhook reconciliation processed (${updated} updated, ${missing} missing).`,
    metadata: {
      updated,
      missing,
      total: results.length,
    },
  });

  await updateWebhookEventResult(eventId, {
    processedAt: new Date(),
    lastResult: {
      ok: true,
      updated,
      missing,
      total: results.length,
    },
  });

  return NextResponse.json({ ok: true, updated, missing, total: results.length });
}
