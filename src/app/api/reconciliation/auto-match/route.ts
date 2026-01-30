import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { reconciliationMatchSchema } from "@/lib/validators/payments";
import { listStatementLines, updateStatementLine } from "@/lib/data/bank-statement-lines";
import { listCashTransactions } from "@/lib/data/cash-transactions";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reconciliationMatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [lines, transactions] = await Promise.all([
    listStatementLines(parsed.data.companyId, parsed.data.accountId),
    listCashTransactions(parsed.data.companyId, parsed.data.accountId),
  ]);

  const usedTransactions = new Set(
    lines
      .filter((line) => line.matchedCashTransactionId)
      .map((line) => line.matchedCashTransactionId as string)
  );

  const unmatched = lines.filter((line) => line.status === "unmatched");
  let matched = 0;

  for (const line of unmatched) {
    const direction = line.amount >= 0 ? "in" : "out";
    const amount = Math.abs(line.amount);
    const match = transactions.find(
      (tx) =>
        !usedTransactions.has(tx.id) &&
        tx.direction === direction &&
        tx.amount === amount &&
        tx.date === line.date
    );
    if (!match) {
      continue;
    }
    await updateStatementLine(line.id, {
      status: "matched",
      matchedCashTransactionId: match.id,
    });
    usedTransactions.add(match.id);
    matched += 1;
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "reconciliation.autoMatch",
    entity: "bank_statement",
    metadata: { matched },
  });

  return NextResponse.json({ matched, total: unmatched.length });
}
