import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listSystemAlerts } from "@/lib/data/system-alerts";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") as
    | "open"
    | "acknowledged"
    | "resolved"
    | null) ?? "all";
  const severity = (searchParams.get("severity") as
    | "low"
    | "medium"
    | "high"
    | "critical"
    | null) ?? "all";

  const alerts = await listSystemAlerts({
    status,
    severity,
  });

  const headers = [
    "id",
    "title",
    "message",
    "type",
    "severity",
    "status",
    "createdAt",
    "source",
    "entityId",
    "resolvedAt",
    "resolvedBy",
  ];
  const rows = alerts.map((alert) => [
    alert.id,
    alert.title,
    alert.message,
    alert.type,
    alert.severity,
    alert.status,
    alert.createdAt.toISOString(),
    alert.source ?? "",
    alert.entityId ?? "",
    alert.resolvedAt ? alert.resolvedAt.toISOString() : "",
    alert.resolvedBy ?? "",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=system-alerts.csv",
      "Cache-Control": "no-store",
    },
  });
}
