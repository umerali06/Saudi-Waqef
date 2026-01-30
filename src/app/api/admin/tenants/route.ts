import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listTenantSummaries } from "@/lib/data/tenants";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const tenants = await listTenantSummaries();
  return NextResponse.json({
    tenants: tenants.map((tenant) => ({
      ...tenant,
      createdAt: tenant.createdAt.toISOString(),
    })),
  });
}
