import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
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

  const bills = await listPurchaseBills(companyId);
  const headers = [
    "billNumber",
    "vendorName",
    "vendorBillNumber",
    "status",
    "billDate",
    "dueDate",
    "total",
    "balance",
    "currency",
  ];
  const rows = bills.map((bill) => [
    bill.billNumber,
    bill.vendorName,
    bill.vendorBillNumber ?? "",
    bill.status,
    bill.billDate,
    bill.dueDate,
    String(bill.total ?? 0),
    String(bill.balance ?? 0),
    bill.currency ?? "SAR",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=bills.csv",
      "Cache-Control": "no-store",
    },
  });
}
