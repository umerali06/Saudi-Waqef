import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listPaymentReceipts } from "@/lib/data/payment-receipts";
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

  const receipts = await listPaymentReceipts(companyId);
  const headers = [
    "receiptNumber",
    "receiptDate",
    "customerName",
    "method",
    "reference",
    "totalAmount",
    "appliedAmount",
    "unappliedAmount",
    "currency",
  ];
  const rows = receipts.map((receipt) => [
    receipt.receiptNumber,
    receipt.receiptDate,
    receipt.customerName,
    receipt.method,
    receipt.reference ?? "",
    String(receipt.totalAmount ?? 0),
    String(receipt.appliedAmount ?? 0),
    String(receipt.unappliedAmount ?? 0),
    receipt.currency ?? "SAR",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=receipts.csv",
      "Cache-Control": "no-store",
    },
  });
}
