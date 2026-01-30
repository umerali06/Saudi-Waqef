import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/admin/access";
import { updateSystemAlert } from "@/lib/data/system-alerts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ alertId: string }> }
) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { alertId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await updateSystemAlert(alertId, parsed.data);

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.alert.update",
    entity: "system_alert",
    entityId: alertId,
    metadata: parsed.data,
  });

  return NextResponse.json({ success: true });
}
