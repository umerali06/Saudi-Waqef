import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { createDrDrill, listDrDrills } from "@/lib/data/disaster-recovery";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["backup_restore", "failover", "tabletop", "other"]),
  scope: z.string().trim().min(1),
  status: z.enum(["planned", "in_progress", "completed", "failed"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional().nullable(),
  rpoAchievedMinutes: z.number().min(0).optional().nullable(),
  rtoAchievedMinutes: z.number().min(0).optional().nullable(),
  runBy: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const drills = await listDrDrills();
  return NextResponse.json({
    drills: drills.map((drill) => ({
      ...drill,
      startedAt: drill.startedAt.toISOString(),
      completedAt: drill.completedAt ? drill.completedAt.toISOString() : null,
      createdAt: drill.createdAt.toISOString(),
    })),
  });
}

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

  const id = await createDrDrill({
    ...parsed.data,
    startedAt: new Date(parsed.data.startedAt),
    completedAt: parsed.data.completedAt ? new Date(parsed.data.completedAt) : null,
  });

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.dr.drill.create",
    entity: "dr_drill",
    entityId: id,
    metadata: {
      type: parsed.data.type,
      status: parsed.data.status,
    },
  });

  return NextResponse.json({ id });
}
