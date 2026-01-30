import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { MIGRATIONS } from "@/lib/migrations";
import { listMigrationRegistry, listMigrationRuns } from "@/lib/data/migrations";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const [registryRecords, runs] = await Promise.all([
    listMigrationRegistry(),
    listMigrationRuns(),
  ]);
  const registryMap = new Map(
    registryRecords.map((record) => [record.id, record])
  );

  const migrations = MIGRATIONS.map((migration) => {
    const record = registryMap.get(migration.id);
    return {
      id: migration.id,
      title: migration.title,
      description: migration.description,
      status: record?.status ?? "pending",
      lastRunAt: record?.lastRunAt ? record.lastRunAt.toISOString() : null,
      lastRunStatus: record?.lastRunStatus ?? null,
      lastRunDryRun: record?.lastRunDryRun ?? false,
      lastRunBy: record?.lastRunByEmail ?? null,
      lastRunId: record?.lastRunId ?? null,
      lastResult: record?.lastResult ?? null,
      appliedAt: record?.appliedAt ? record.appliedAt.toISOString() : null,
    };
  });

  return NextResponse.json({
    migrations,
    runs: runs.map((run) => ({
      id: run.id,
      migrationId: run.migrationId,
      title: run.title,
      status: run.status,
      dryRun: run.dryRun,
      scanned: run.scanned,
      updated: run.updated,
      notes: run.notes ?? [],
      error: run.error ?? null,
      logs: run.logs ?? [],
      startedBy: run.startedByEmail ?? run.startedBy,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    })),
  });
}
