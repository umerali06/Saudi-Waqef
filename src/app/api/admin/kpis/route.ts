import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { getKpiSnapshot } from "@/lib/data/kpis";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const snapshot = await getKpiSnapshot();
  return NextResponse.json({ kpis: snapshot });
}
