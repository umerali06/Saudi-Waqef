import { Timestamp, Query } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type TelemetryEvent = {
  id: string;
  name: string;
  companyId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

const toDate = (value?: { toDate?: () => Date } | null) =>
  value?.toDate ? value.toDate() : new Date();

export async function createTelemetryEvent(params: {
  name: string;
  companyId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const id = uuidv4();
  await db.collection("telemetry_events").doc(id).set({
    name: params.name,
    companyId: params.companyId ?? null,
    userId: params.userId ?? null,
    metadata: params.metadata ?? {},
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function listTelemetryEvents(params: {
  name?: string;
  companyId?: string;
  since?: Date;
  limitCount?: number;
}) {
  let query: Query = db.collection("telemetry_events");
  if (params.name) {
    query = query.where("name", "==", params.name);
  }
  if (params.companyId) {
    query = query.where("companyId", "==", params.companyId);
  }
  if (params.since) {
    query = query.where("createdAt", ">=", Timestamp.fromDate(params.since));
  }
  const snapshot = await query.limit(params.limitCount ?? 200).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name ?? "",
      companyId: data.companyId ?? null,
      userId: data.userId ?? null,
      metadata: data.metadata ?? {},
      createdAt: toDate(data.createdAt),
    } as TelemetryEvent;
  });
}

export async function countTelemetryEvents(params: {
  name: string;
  since?: Date;
}) {
  let query = db.collection("telemetry_events").where("name", "==", params.name);
  if (params.since) {
    query = query.where("createdAt", ">=", Timestamp.fromDate(params.since));
  }
  const snapshot = await query.get();
  return snapshot.size;
}
