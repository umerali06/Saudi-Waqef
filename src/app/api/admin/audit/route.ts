import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listAuditEvents } from "@/lib/data/audit-logs";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const events = await listAuditEvents({ companyId: "system", limit: 200 });
  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id,
      userEmail: event.userEmail ?? null,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
  });
}
