import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import type { MigrationResult } from "@/lib/migrations/types";

export type MigrationRegistryStatus = "pending" | "running" | "applied" | "failed";
export type MigrationRunStatus = "running" | "completed" | "failed";

export type MigrationRegistryRecord = {
  id: string;
  title: string;
  description: string;
  status: MigrationRegistryStatus;
  appliedAt?: Date | null;
  lastRunAt?: Date | null;
  lastRunStatus?: MigrationRunStatus | null;
  lastRunDryRun?: boolean;
  lastRunBy?: string | null;
  lastRunByEmail?: string | null;
  lastRunId?: string | null;
  lastResult?: MigrationResult | null;
};

export type MigrationRunRecord = {
  id: string;
  migrationId: string;
  title: string;
  status: MigrationRunStatus;
  dryRun: boolean;
  scanned: number;
  updated: number;
  notes?: string[];
  error?: string | null;
  logs?: string[];
  startedBy: string;
  startedByEmail?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
};

const toDate = (value?: { toDate?: () => Date } | null) =>
  value?.toDate ? value.toDate() : null;

const toTimestamp = (value?: Date | null) => {
  if (value === undefined) {
    return undefined;
  }
  return value ? Timestamp.fromDate(value) : null;
};

export async function listMigrationRegistry() {
  const snapshot = await db.collection("migration_registry").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title ?? doc.id,
      description: data.description ?? "",
      status: (data.status ?? "pending") as MigrationRegistryStatus,
      appliedAt: toDate(data.appliedAt),
      lastRunAt: toDate(data.lastRunAt),
      lastRunStatus: (data.lastRunStatus ?? null) as MigrationRunStatus | null,
      lastRunDryRun: data.lastRunDryRun ?? false,
      lastRunBy: data.lastRunBy ?? null,
      lastRunByEmail: data.lastRunByEmail ?? null,
      lastRunId: data.lastRunId ?? null,
      lastResult: data.lastResult ?? null,
    } as MigrationRegistryRecord;
  });
}

export async function getMigrationRegistry(migrationId: string) {
  const doc = await db.collection("migration_registry").doc(migrationId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    title: data.title ?? doc.id,
    description: data.description ?? "",
    status: (data.status ?? "pending") as MigrationRegistryStatus,
    appliedAt: toDate(data.appliedAt),
    lastRunAt: toDate(data.lastRunAt),
    lastRunStatus: (data.lastRunStatus ?? null) as MigrationRunStatus | null,
    lastRunDryRun: data.lastRunDryRun ?? false,
    lastRunBy: data.lastRunBy ?? null,
    lastRunByEmail: data.lastRunByEmail ?? null,
    lastRunId: data.lastRunId ?? null,
    lastResult: data.lastResult ?? null,
  } as MigrationRegistryRecord;
}

export async function upsertMigrationRegistry(
  migrationId: string,
  updates: Partial<MigrationRegistryRecord>
) {
  const payload: Record<string, unknown> = {
    ...updates,
  };
  if (updates.appliedAt !== undefined) {
    payload.appliedAt = toTimestamp(updates.appliedAt);
  }
  if (updates.lastRunAt !== undefined) {
    payload.lastRunAt = toTimestamp(updates.lastRunAt);
  }
  await db.collection("migration_registry").doc(migrationId).set(payload, {
    merge: true,
  });
}

export async function createMigrationRun(params: {
  migrationId: string;
  title: string;
  dryRun: boolean;
  startedBy: string;
  startedByEmail?: string | null;
}) {
  const id = uuidv4();
  await db.collection("migration_runs").doc(id).set({
    migrationId: params.migrationId,
    title: params.title,
    dryRun: params.dryRun,
    status: "running",
    scanned: 0,
    updated: 0,
    notes: [],
    error: null,
    logs: [],
    startedBy: params.startedBy,
    startedByEmail: params.startedByEmail ?? null,
    startedAt: Timestamp.now(),
  });
  return id;
}

export async function updateMigrationRun(
  runId: string,
  updates: Partial<MigrationRunRecord>
) {
  const payload: Record<string, unknown> = {
    ...updates,
  };
  if (updates.startedAt !== undefined) {
    payload.startedAt = toTimestamp(updates.startedAt);
  }
  if (updates.completedAt !== undefined) {
    payload.completedAt = toTimestamp(updates.completedAt);
  }
  await db.collection("migration_runs").doc(runId).set(payload, { merge: true });
}

export async function listMigrationRuns(limitCount = 40) {
  const snapshot = await db
    .collection("migration_runs")
    .orderBy("startedAt", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      migrationId: data.migrationId ?? "",
      title: data.title ?? data.migrationId ?? "",
      status: (data.status ?? "running") as MigrationRunStatus,
      dryRun: data.dryRun ?? false,
      scanned: data.scanned ?? 0,
      updated: data.updated ?? 0,
      notes: data.notes ?? [],
      error: data.error ?? null,
      logs: data.logs ?? [],
      startedBy: data.startedBy ?? "",
      startedByEmail: data.startedByEmail ?? null,
      startedAt: toDate(data.startedAt) ?? new Date(),
      completedAt: toDate(data.completedAt),
    } as MigrationRunRecord;
  });
}
