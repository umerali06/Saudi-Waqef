import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getVendorById } from "@/lib/data/vendors";
import { listOpenItems, computeAging } from "@/lib/data/open-items";

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

  const items = await listOpenItems(vendor.companyId, "vendor", vendorId);
  const aging = computeAging(items);

  return NextResponse.json({ items, aging });
}

