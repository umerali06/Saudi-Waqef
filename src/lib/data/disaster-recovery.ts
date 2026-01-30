import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type DrSettings = {
  id: string;
  rpoMinutes: number;
  rtoMinutes: number;
  backupFrequencyHours: number;
  retentionDays: number;
  backupRegion: string;
  priorityCritical: string[];
  priorityHigh: string[];
  priorityMedium: string[];
  priorityLow: string[];
  lastReviewedAt?: Date | null;
  approvedBy?: string | null;
  updatedAt?: Date;
};

export type DrDrillStatus = "planned" | "in_progress" | "completed" | "failed";
export type DrDrillType = "backup_restore" | "failover" | "tabletop" | "other";

export type DrDrill = {
  id: string;
  type: DrDrillType;
  scope: string;
  status: DrDrillStatus;
  startedAt: Date;
  completedAt?: Date | null;
  rpoAchievedMinutes?: number | null;
  rtoAchievedMinutes?: number | null;
  runBy?: string | null;
  notes?: string | null;
  createdAt: Date;
};

const DEFAULT_SETTINGS: DrSettings = {
  id: "default",
  rpoMinutes: 60,
  rtoMinutes: 240,
  backupFrequencyHours: 6,
  retentionDays: 30,
  backupRegion: "me-central1",
  priorityCritical: ["ledger", "payroll", "auth"],
  priorityHigh: ["billing", "vat", "collections"],
  priorityMedium: ["reports", "analytics"],
  priorityLow: ["notifications", "marketing"],
  lastReviewedAt: null,
  approvedBy: null,
};

const toDate = (value?: { toDate?: () => Date } | null) =>
  value?.toDate ? value.toDate() : null;

const safeArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

export async function getDrSettings() {
  const doc = await db.collection("dr_settings").doc("default").get();
  if (!doc.exists) {
    return DEFAULT_SETTINGS;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    rpoMinutes: data.rpoMinutes ?? DEFAULT_SETTINGS.rpoMinutes,
    rtoMinutes: data.rtoMinutes ?? DEFAULT_SETTINGS.rtoMinutes,
    backupFrequencyHours:
      data.backupFrequencyHours ?? DEFAULT_SETTINGS.backupFrequencyHours,
    retentionDays: data.retentionDays ?? DEFAULT_SETTINGS.retentionDays,
    backupRegion: data.backupRegion ?? DEFAULT_SETTINGS.backupRegion,
    priorityCritical: safeArray(data.priorityCritical),
    priorityHigh: safeArray(data.priorityHigh),
    priorityMedium: safeArray(data.priorityMedium),
    priorityLow: safeArray(data.priorityLow),
    lastReviewedAt: toDate(data.lastReviewedAt),
    approvedBy: data.approvedBy ?? null,
    updatedAt: toDate(data.updatedAt) ?? undefined,
  } as DrSettings;
}

export async function updateDrSettings(
  updates: Partial<Omit<DrSettings, "id">>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.lastReviewedAt !== undefined) {
    payload.lastReviewedAt = updates.lastReviewedAt
      ? Timestamp.fromDate(updates.lastReviewedAt)
      : null;
  }
  await db.collection("dr_settings").doc("default").set(payload, { merge: true });
}

export async function listDrDrills(limitCount = 30) {
  const snapshot = await db
    .collection("dr_drills")
    .orderBy("startedAt", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type ?? "backup_restore",
      scope: data.scope ?? "",
      status: data.status ?? "planned",
      startedAt: data.startedAt?.toDate ? data.startedAt.toDate() : new Date(),
      completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : null,
      rpoAchievedMinutes: data.rpoAchievedMinutes ?? null,
      rtoAchievedMinutes: data.rtoAchievedMinutes ?? null,
      runBy: data.runBy ?? null,
      notes: data.notes ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as DrDrill;
  });
}

export async function createDrDrill(params: {
  type: DrDrillType;
  scope: string;
  status: DrDrillStatus;
  startedAt: Date;
  completedAt?: Date | null;
  rpoAchievedMinutes?: number | null;
  rtoAchievedMinutes?: number | null;
  runBy?: string | null;
  notes?: string | null;
}) {
  const id = uuidv4();
  await db.collection("dr_drills").doc(id).set({
    type: params.type,
    scope: params.scope,
    status: params.status,
    startedAt: Timestamp.fromDate(params.startedAt),
    completedAt: params.completedAt
      ? Timestamp.fromDate(params.completedAt)
      : null,
    rpoAchievedMinutes: params.rpoAchievedMinutes ?? null,
    rtoAchievedMinutes: params.rtoAchievedMinutes ?? null,
    runBy: params.runBy ?? null,
    notes: params.notes ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateDrDrill(
  drillId: string,
  updates: Partial<Omit<DrDrill, "id" | "createdAt">>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.startedAt) {
    payload.startedAt = Timestamp.fromDate(updates.startedAt);
  }
  if (updates.completedAt !== undefined) {
    payload.completedAt = updates.completedAt
      ? Timestamp.fromDate(updates.completedAt)
      : null;
  }
  await db.collection("dr_drills").doc(drillId).set(payload, { merge: true });
}
