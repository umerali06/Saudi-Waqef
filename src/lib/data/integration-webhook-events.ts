import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type IntegrationWebhookEventRecord = {
  id: string;
  integrationId: string;
  timestamp: string;
  signature: string;
  payloadRaw?: string | null;
  payload?: Record<string, unknown> | null;
  processedAt?: Date | null;
  replayCount?: number;
  lastReplayAt?: Date | null;
  lastResult?: Record<string, unknown> | null;
  createdAt: Date;
};

export async function registerWebhookEvent(params: {
  integrationId: string;
  eventId: string;
  timestamp: string;
  signature: string;
  payloadRaw?: string;
  payload?: Record<string, unknown> | null;
}) {
  const ref = db.collection("integration_webhook_events").doc(params.eventId);
  const existing = await ref.get();
  if (existing.exists) {
    return { created: false };
  }

  await ref.set({
    integrationId: params.integrationId,
    timestamp: params.timestamp,
    signature: params.signature,
    payloadRaw: params.payloadRaw ?? null,
    payload: params.payload ?? null,
    processedAt: null,
    replayCount: 0,
    lastReplayAt: null,
    lastResult: null,
    createdAt: Timestamp.now(),
  });
  return { created: true };
}

export async function getWebhookEventById(eventId: string) {
  const doc = await db.collection("integration_webhook_events").doc(eventId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    integrationId: data.integrationId,
    timestamp: data.timestamp,
    signature: data.signature,
    payloadRaw: typeof data.payloadRaw === "string" ? data.payloadRaw : null,
    payload: data.payload && typeof data.payload === "object" ? data.payload : null,
    processedAt: data.processedAt?.toDate ? data.processedAt.toDate() : null,
    replayCount: typeof data.replayCount === "number" ? data.replayCount : 0,
    lastReplayAt: data.lastReplayAt?.toDate ? data.lastReplayAt.toDate() : null,
    lastResult: data.lastResult && typeof data.lastResult === "object" ? data.lastResult : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as IntegrationWebhookEventRecord;
}

export async function updateWebhookEventResult(
  eventId: string,
  params: {
    processedAt?: Date;
    replayed?: boolean;
    lastResult: Record<string, unknown>;
  }
) {
  const payload: Record<string, unknown> = {
    lastResult: params.lastResult,
    updatedAt: Timestamp.now(),
  };
  if (params.processedAt) {
    payload.processedAt = Timestamp.fromDate(params.processedAt);
  }
  if (params.replayed) {
    payload.lastReplayAt = Timestamp.now();
    payload.replayCount = FieldValue.increment(1);
  }

  await db.collection("integration_webhook_events").doc(eventId).set(payload, { merge: true });
}

export async function listWebhookEventsByIntegration(
  integrationId: string,
  limitCount = 50,
  options?: {
    eventIdContains?: string;
    failedOnly?: boolean;
  }
) {
  const snapshot = await db
    .collection("integration_webhook_events")
    .where("integrationId", "==", integrationId)
    .get();

  const events = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      integrationId: data.integrationId,
      timestamp: data.timestamp,
      signature: data.signature,
      payloadRaw: typeof data.payloadRaw === "string" ? data.payloadRaw : null,
      payload: data.payload && typeof data.payload === "object" ? data.payload : null,
      processedAt: data.processedAt?.toDate ? data.processedAt.toDate() : null,
      replayCount: typeof data.replayCount === "number" ? data.replayCount : 0,
      lastReplayAt: data.lastReplayAt?.toDate ? data.lastReplayAt.toDate() : null,
      lastResult: data.lastResult && typeof data.lastResult === "object" ? data.lastResult : null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as IntegrationWebhookEventRecord;
  });

  const filtered = events
    .filter((event) => {
      if (options?.eventIdContains) {
        const needle = options.eventIdContains.toLowerCase();
        if (!event.id.toLowerCase().includes(needle)) {
          return false;
        }
      }
      if (options?.failedOnly) {
        const lastResult = event.lastResult ?? {};
        const ok = lastResult.ok;
        const missing =
          typeof lastResult.missing === "number" ? lastResult.missing : 0;
        if (ok === true && missing === 0 && event.processedAt) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);

  return filtered;
}
