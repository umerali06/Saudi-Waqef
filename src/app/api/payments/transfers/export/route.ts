import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listBankTransfers } from "@/lib/data/bank-transfers";
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

  const transfers = await listBankTransfers(companyId);
  const headers = [
    "transferNumber",
    "transferDate",
    "fromAccountName",
    "toAccountName",
    "amount",
    "currency",
    "reference",
  ];
  const rows = transfers.map((transfer) => [
    transfer.transferNumber,
    transfer.transferDate,
    transfer.fromAccountName,
    transfer.toAccountName,
    String(transfer.amount ?? 0),
    transfer.currency ?? "SAR",
    transfer.reference ?? "",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=transfers.csv",
      "Cache-Control": "no-store",
    },
  });
}
