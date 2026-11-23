import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { listStatementLines } from "@/lib/data/bank-statement-lines";
import { listCashTransactions } from "@/lib/data/cash-transactions";

export const runtime = "nodejs";

/** Cash transactions of an account that no statement line is matched to yet. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const accountId = searchParams.get("accountId");
  if (!companyId || !accountId) {
    return NextResponse.json(
      { error: "companyId and accountId are required" },
      { status: 400 }
    );
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [lines, transactions] = await Promise.all([
    listStatementLines(companyId, accountId),
    listCashTransactions(companyId, accountId),
  ]);
  const matched = new Set(lines.map((line) => line.matchedCashTransactionId));

  return NextResponse.json({
    transactions: transactions
      .filter((transaction) => !matched.has(transaction.id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        amount: transaction.amount,
        direction: transaction.direction,
        reference: transaction.reference ?? null,
        description: transaction.description ?? null,
      })),
  });
}
