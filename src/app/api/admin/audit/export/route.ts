import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listAuditEvents } from "@/lib/data/audit-logs";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const events = await listAuditEvents({ companyId: "system", limit: 2000 });
  const headers = ["date", "userEmail", "action", "entity", "entityId", "metadata"];
  const rows = events.map((event) => [
    event.createdAt.toISOString(),
    event.userEmail ?? "",
    event.action,
    event.entity,
    event.entityId ?? "",
    JSON.stringify(event.metadata ?? {}),
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=system-audit.csv",
      "Cache-Control": "no-store",
    },
  });
}
