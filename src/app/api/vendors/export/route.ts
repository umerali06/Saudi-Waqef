import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listVendors } from "@/lib/data/vendors";
import { toCsv } from "@/lib/utils/csv";

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

  const vendors = await listVendors(companyId);
  const headers = [
    "name",
    "legalName",
    "vatNumber",
    "crNumber",
    "email",
    "phone",
    "remittanceAddress",
    "paymentTermId",
    "preferredPaymentMethod",
    "currency",
    "notes",
    "tags",
    "status",
    "vatRegistered",
  ];
  const rows = vendors.map((vendor) => [
    vendor.name,
    vendor.legalName ?? "",
    vendor.vatNumber ?? "",
    vendor.crNumber ?? "",
    vendor.email ?? "",
    vendor.phone ?? "",
    vendor.remittanceAddress ?? "",
    vendor.paymentTermId ?? "",
    vendor.preferredPaymentMethod ?? "",
    vendor.currency ?? "",
    vendor.notes ?? "",
    vendor.tags.join("|"),
    vendor.status,
    vendor.vatRegistered ? "true" : "false",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=vendors.csv",
      "Cache-Control": "no-store",
    },
  });
}

