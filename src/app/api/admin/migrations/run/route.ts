import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { getMigrationById } from "@/lib/migrations";
import { getMigrationRegistry } from "@/lib/data/migrations";
import { runMigration } from "@/lib/migrations/runner";

export const runtime = "nodejs";

const schema = z.object({
  migrationId: z.string().trim(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const migration = getMigrationById(parsed.data.migrationId);
  if (!migration) {
    return NextResponse.json({ error: "Migration not found" }, { status: 404 });
  }

  const registry = await getMigrationRegistry(migration.id);
  if (registry?.status === "running") {
    return NextResponse.json({ error: "Migration already running" }, { status: 409 });
  }

  try {
    const run = await runMigration({
      migration,
      dryRun: parsed.data.dryRun ?? false,
      actor: {
        id: access.user?.id ?? "system",
        email: access.user?.email ?? null,
      },
    });
    return NextResponse.json({
      run: {
        id: run.runId,
        status: run.status,
        scanned: run.result.scanned,
        updated: run.result.updated,
        notes: run.result.notes ?? [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Migration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
