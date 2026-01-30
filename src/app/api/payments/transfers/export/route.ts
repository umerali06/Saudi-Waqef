import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listBankTransfers } from "@/lib/data/bank-transfers";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
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

  const [transfers, accounts] = await Promise.all([
    listBankTransfers(companyId),
    listCashBankAccounts(companyId),
  ]);
  const accountNameMap = new Map(
    accounts.map((account) => [account.accountId, account.name])
  );
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
    accountNameMap.get(transfer.fromAccountId) ?? "",
    accountNameMap.get(transfer.toAccountId) ?? "",
    String(transfer.amount ?? 0),
    "SAR",
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
