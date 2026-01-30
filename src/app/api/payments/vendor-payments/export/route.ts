import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listVendorPayments } from "@/lib/data/vendor-payments";
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

  const payments = await listVendorPayments(companyId);
  const headers = [
    "paymentNumber",
    "paymentDate",
    "vendorName",
    "method",
    "reference",
    "totalAmount",
    "appliedAmount",
    "unappliedAmount",
    "currency",
  ];
  const rows = payments.map((payment) => [
    payment.paymentNumber,
    payment.paymentDate,
    payment.vendorName,
    payment.method,
    payment.reference ?? "",
    String(payment.totalAmount ?? 0),
    String(payment.appliedAmount ?? 0),
    String(payment.unappliedAmount ?? 0),
    payment.currency ?? "SAR",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=vendor-payments.csv",
      "Cache-Control": "no-store",
    },
  });
}
