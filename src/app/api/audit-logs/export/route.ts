import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { listAuditEvents } from "@/lib/data/audit-logs";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await listAuditEvents({
    companyId,
    userId: searchParams.get("userId"),
    action: searchParams.get("action"),
    entity: searchParams.get("entity"),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    query: searchParams.get("q"),
    limit: Number(searchParams.get("limit") ?? "2000"),
  });

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
      "Content-Disposition": "attachment; filename=audit-log.csv",
      "Cache-Control": "no-store",
    },
  });
}
