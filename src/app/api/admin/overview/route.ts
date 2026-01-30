import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { getSystemHealthSummary, getSystemOverview } from "@/lib/data/system-metrics";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const [overview, health] = await Promise.all([
    getSystemOverview(),
    getSystemHealthSummary(),
  ]);

  return NextResponse.json({
    ...overview,
    health,
  });
}
