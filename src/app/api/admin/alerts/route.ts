import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listSystemAlerts } from "@/lib/data/system-alerts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as
    | "open"
    | "acknowledged"
    | "resolved"
    | null;
  const severity = searchParams.get("severity") as
    | "low"
    | "medium"
    | "high"
    | "critical"
    | null;

  const alerts = await listSystemAlerts({
    status: status ?? "all",
    severity: severity ?? "all",
  });

  return NextResponse.json({
    alerts: alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      message: alert.message,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      createdAt: alert.createdAt.toISOString(),
    })),
  });
}
