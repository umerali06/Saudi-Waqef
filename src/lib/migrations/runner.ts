import type { Migration, MigrationResult } from "@/lib/migrations/types";
import {
  createMigrationRun,
  getMigrationRegistry,
  updateMigrationRun,
  upsertMigrationRegistry,
} from "@/lib/data/migrations";
import { recordAuditEvent } from "@/lib/data/audit-log";

type MigrationActor = {
  id: string;
  email?: string | null;
};

type RunMigrationParams = {
  migration: Migration;
  dryRun: boolean;
  actor: MigrationActor;
};

type RunMigrationResult = {
  runId: string;
  status: "completed" | "failed";
  result: MigrationResult;
  logs: string[];
};

const MAX_LOG_LINES = 200;

export async function runMigration(params: RunMigrationParams): Promise<RunMigrationResult> {
  const existing = await getMigrationRegistry(params.migration.id);
  if (existing?.status === "running") {
    throw new Error("Migration already running.");
  }

  const logs: string[] = [];
  const log = (message: string) => {
    const entry = `${new Date().toISOString()} ${message}`;
    logs.push(entry);
    if (logs.length > MAX_LOG_LINES) {
      logs.shift();
    }
  };

  const runId = await createMigrationRun({
    migrationId: params.migration.id,
    title: params.migration.title,
    dryRun: params.dryRun,
    startedBy: params.actor.id,
    startedByEmail: params.actor.email ?? null,
  });

  await upsertMigrationRegistry(params.migration.id, {
    title: params.migration.title,
    description: params.migration.description,
    status: "running",
    lastRunStatus: "running",
    lastRunAt: new Date(),
    lastRunDryRun: params.dryRun,
    lastRunBy: params.actor.id,
    lastRunByEmail: params.actor.email ?? null,
    lastRunId: runId,
  });

  let result: MigrationResult = { scanned: 0, updated: 0, notes: [] };
  let error: string | null = null;

  try {
    log(`Starting migration ${params.migration.id}`);
    result = await params.migration.up({ dryRun: params.dryRun, log });
    log(`Migration completed with ${result.updated} updates.`);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    log(`Migration failed: ${error}`);
  }

  const completedAt = new Date();
  const status = error ? "failed" : "completed";

  await updateMigrationRun(runId, {
    status,
    scanned: result.scanned,
    updated: result.updated,
    notes: result.notes ?? [],
    error,
    logs,
    completedAt,
  });

  const nextStatus = error
    ? "failed"
    : params.dryRun
      ? existing?.status ?? "pending"
      : "applied";

  await upsertMigrationRegistry(params.migration.id, {
    status: nextStatus,
    lastRunStatus: status,
    lastRunAt: completedAt,
    lastRunDryRun: params.dryRun,
    lastRunBy: params.actor.id,
    lastRunByEmail: params.actor.email ?? null,
    lastRunId: runId,
    lastResult: result,
    appliedAt: !error && !params.dryRun ? completedAt : existing?.appliedAt ?? null,
  });

  await recordAuditEvent({
    companyId: "system",
    userId: params.actor.id,
    userEmail: params.actor.email ?? undefined,
    action: "admin.migration.run",
    entity: "migration",
    entityId: params.migration.id,
    metadata: {
      runId,
      dryRun: params.dryRun,
      status,
      scanned: result.scanned,
      updated: result.updated,
    },
  });

  if (error) {
    throw new Error(error);
  }

  return {
    runId,
    status,
    result,
    logs,
  };
}
