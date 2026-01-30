import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { vendorUpdateSchema } from "@/lib/validators/parties";
import { getVendorById, listVendors, updateVendor } from "@/lib/data/vendors";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ vendorId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vendorId } = await context.params;
  const vendor = await getVendorById(vendorId);
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, vendor.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ vendor });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vendorId } = await context.params;
  const current = await getVendorById(vendorId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vendorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, current.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const vatNumber = parsed.data.vatNumber?.trim() ?? current.vatNumber ?? "";
  const vatRegistered = parsed.data.vatRegistered ?? current.vatRegistered;

  const existing = await listVendors(current.companyId);
  const normalizedName = parsed.data.name
    ? normalizeSearch(parsed.data.name)
    : normalizeSearch(current.name);
  const duplicate = existing.find((vendor) => {
    if (vendor.id === vendorId) {
      return false;
    }
    if (vatNumber && vendor.vatNumber === vatNumber) {
      return true;
    }
    return normalizeSearch(vendor.name) === normalizedName;
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate vendor" }, { status: 409 });
  }

  await updateVendor(vendorId, {
    ...parsed.data,
    vatRegistered,
    vatNumber: vatNumber || null,
  });

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor.update",
    entity: "vendor",
    entityId: vendorId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

