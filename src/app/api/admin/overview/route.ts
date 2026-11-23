import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listPlatformAdmins } from "@/lib/data/system-admins";
import { getSystemHealthSummary, getSystemOverview } from "@/lib/data/system-metrics";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const [overview, health, platformAdmins] = await Promise.all([
    getSystemOverview(),
    getSystemHealthSummary(),
    listPlatformAdmins(),
  ]);

  return NextResponse.json({
    ...overview,
    health,
    platformAdmins,
  });
}
