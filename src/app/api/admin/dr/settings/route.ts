import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { getDrSettings, updateDrSettings } from "@/lib/data/disaster-recovery";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  rpoMinutes: z.number().min(1),
  rtoMinutes: z.number().min(1),
  backupFrequencyHours: z.number().min(1),
  retentionDays: z.number().min(1),
  backupRegion: z.string().trim().min(1),
  priorityCritical: z.array(z.string()).default([]),
  priorityHigh: z.array(z.string()).default([]),
  priorityMedium: z.array(z.string()).default([]),
  priorityLow: z.array(z.string()).default([]),
  lastReviewedAt: z.string().datetime().optional().nullable(),
  approvedBy: z.string().trim().optional().nullable(),
});

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const settings = await getDrSettings();
  return NextResponse.json({
    settings: {
      ...settings,
      lastReviewedAt: settings.lastReviewedAt
        ? settings.lastReviewedAt.toISOString()
        : null,
    },
  });
}

export async function PUT(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await updateDrSettings({
    ...parsed.data,
    lastReviewedAt: parsed.data.lastReviewedAt
      ? new Date(parsed.data.lastReviewedAt)
      : null,
  });

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.dr.settings.update",
    entity: "dr_settings",
    entityId: "default",
    metadata: {
      rpoMinutes: parsed.data.rpoMinutes,
      rtoMinutes: parsed.data.rtoMinutes,
    },
  });

  return NextResponse.json({ success: true });
}
