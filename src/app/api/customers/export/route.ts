import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listCustomers } from "@/lib/data/customers";
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

  const customers = await listCustomers(companyId);
  const headers = [
    "name",
    "legalName",
    "vatNumber",
    "crNumber",
    "email",
    "phone",
    "billingAddress",
    "shippingAddress",
    "paymentTermId",
    "creditLimit",
    "currency",
    "notes",
    "tags",
    "status",
    "vatRegistered",
  ];
  const rows = customers.map((customer) => [
    customer.name,
    customer.legalName ?? "",
    customer.vatNumber ?? "",
    customer.crNumber ?? "",
    customer.email ?? "",
    customer.phone ?? "",
    customer.billingAddress ?? "",
    customer.shippingAddress ?? "",
    customer.paymentTermId ?? "",
    customer.creditLimit?.toString() ?? "",
    customer.currency ?? "",
    customer.notes ?? "",
    customer.tags.join("|"),
    customer.status,
    customer.vatRegistered ? "true" : "false",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=customers.csv",
      "Cache-Control": "no-store",
    },
  });
}

