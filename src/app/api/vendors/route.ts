import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { vendorSchema, vendorBulkStatusSchema } from "@/lib/validators/parties";
import { createVendor, listVendors, bulkUpdateVendors } from "@/lib/data/vendors";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";
import { listOpenItemsByCompany, buildAgingByParty } from "@/lib/data/open-items";

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

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = searchParams.get("status");
  const vatRegistered = searchParams.get("vatRegistered");
  const query = normalizeSearch(searchParams.get("q") ?? "");
  const balanceFilter = searchParams.get("balance");

  const vendors = await listVendors(companyId);
  let filtered = vendors;
  if (status && status !== "all") {
    filtered = filtered.filter((vendor) => vendor.status === status);
  }
  if (vatRegistered === "true") {
    filtered = filtered.filter((vendor) => vendor.vatRegistered);
  }
  if (vatRegistered === "false") {
    filtered = filtered.filter((vendor) => !vendor.vatRegistered);
  }
  if (query) {
    filtered = filtered.filter((vendor) => {
      const name = normalizeSearch(vendor.name);
      return (
        name.includes(query) ||
        normalizeSearch(vendor.legalName ?? "").includes(query) ||
        normalizeSearch(vendor.vatNumber ?? "").includes(query) ||
        normalizeSearch(vendor.crNumber ?? "").includes(query)
      );
    });
  }

  const openItems = await listOpenItemsByCompany(companyId);
  const vendorItems = openItems.filter((item) => item.partyType === "vendor");
  const agingMap = buildAgingByParty(vendorItems);

  const data = filtered.map((vendor) => {
    const aging = agingMap.get(vendor.id)?.aging ?? null;
    const balance = aging?.total ?? 0;
    return { ...vendor, balance, aging };
  });

  const finalList =
    balanceFilter === "due"
      ? data.filter((entry) => entry.balance > 0)
      : data;

  return NextResponse.json({ vendors: finalList });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const vatNumber = parsed.data.vatNumber?.trim() ?? "";
  const vatRegistered = parsed.data.vatRegistered ?? Boolean(vatNumber);

  const existing = await listVendors(parsed.data.companyId);
  const normalizedName = normalizeSearch(parsed.data.name);
  const duplicate = existing.find((vendor) => {
    if (vatNumber && vendor.vatNumber === vatNumber) {
      return true;
    }
    return normalizeSearch(vendor.name) === normalizedName;
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate vendor" }, { status: 409 });
  }

  const vendorId = await createVendor({
    ...parsed.data,
    vatRegistered,
    vatNumber: vatNumber || null,
    tags: parsed.data.tags ?? [],
    status: parsed.data.status ?? "active",
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor.create",
    entity: "vendor",
    entityId: vendorId,
    metadata: { name: parsed.data.name },
  });

  return NextResponse.json({ vendorId });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vendorBulkStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await bulkUpdateVendors(parsed.data.ids, { status: parsed.data.status });
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor.bulk_status",
    entity: "vendor",
    metadata: { status: parsed.data.status, count: parsed.data.ids.length },
  });
  return NextResponse.json({ ok: true });
}

