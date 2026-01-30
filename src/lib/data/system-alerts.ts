import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type SystemAlertSeverity = "low" | "medium" | "high" | "critical";
export type SystemAlertStatus = "open" | "acknowledged" | "resolved";

export type SystemAlert = {
  id: string;
  title: string;
  message: string;
  type: string;
  severity: SystemAlertSeverity;
  status: SystemAlertStatus;
  source?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
};

export async function listSystemAlerts(params?: {
  status?: SystemAlertStatus | "all" | null;
  severity?: SystemAlertSeverity | "all" | null;
  limit?: number;
}) {
  const limit = params?.limit && params.limit > 0 ? params.limit : 200;
  const snapshot = await db.collection("system_alerts").limit(limit).get();
  const alerts = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title ?? "",
      message: data.message ?? "",
      type: data.type ?? "unknown",
      severity: (data.severity ?? "low") as SystemAlertSeverity,
      status: (data.status ?? "open") as SystemAlertStatus,
      source: data.source ?? undefined,
      entityId: data.entityId ?? null,
      metadata: data.metadata ?? {},
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
      resolvedAt: data.resolvedAt?.toDate ? data.resolvedAt.toDate() : null,
      resolvedBy: data.resolvedBy ?? null,
    } as SystemAlert;
  });

  let filtered = alerts;
  if (params?.status && params.status !== "all") {
    filtered = filtered.filter((alert) => alert.status === params.status);
  }
  if (params?.severity && params.severity !== "all") {
    filtered = filtered.filter((alert) => alert.severity === params.severity);
  }

  return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createSystemAlert(params: {
  title: string;
  message: string;
  type: string;
  severity: SystemAlertSeverity;
  status?: SystemAlertStatus;
  source?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const id = crypto.randomUUID();
  await db.collection("system_alerts").doc(id).set({
    title: params.title,
    message: params.message,
    type: params.type,
    severity: params.severity,
    status: params.status ?? "open",
    source: params.source ?? null,
    entityId: params.entityId ?? null,
    metadata: params.metadata ?? {},
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateSystemAlert(
  alertId: string,
  updates: Partial<{
    status: SystemAlertStatus;
    severity: SystemAlertSeverity;
    title: string;
    message: string;
    source: string | null;
    entityId: string | null;
    resolvedBy: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.status === "resolved") {
    payload.resolvedAt = Timestamp.now();
  } else if (updates.status) {
    payload.resolvedAt = null;
  }

  await db.collection("system_alerts").doc(alertId).set(payload, { merge: true });
}
