import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listTenantSummaries } from "@/lib/data/tenants";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const query = searchParams.get("q")?.toLowerCase().trim() ?? "";

  const tenants = await listTenantSummaries();
  let filtered = tenants;
  if (status && status !== "all") {
    filtered = filtered.filter((tenant) => tenant.status === status);
  }
  if (query) {
    filtered = filtered.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(query) ||
        tenant.id.toLowerCase().includes(query) ||
        (tenant.ownerEmail ?? "").toLowerCase().includes(query)
    );
  }

  const headers = [
    "id",
    "name",
    "status",
    "currency",
    "defaultLanguage",
    "ownerEmail",
    "userCount",
    "planName",
    "subscriptionStatus",
    "createdAt",
  ];
  const rows = filtered.map((tenant) => [
    tenant.id,
    tenant.name,
    tenant.status,
    tenant.currency,
    tenant.defaultLanguage,
    tenant.ownerEmail ?? "",
    String(tenant.userCount ?? 0),
    tenant.planName ?? "",
    tenant.subscriptionStatus ?? "",
    tenant.createdAt.toISOString(),
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=tenants.csv",
      "Cache-Control": "no-store",
    },
  });
}
