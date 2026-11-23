import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getStatementLineById,
  listStatementLines,
  updateStatementLine,
} from "@/lib/data/bank-statement-lines";
import { listCashTransactions } from "@/lib/data/cash-transactions";
import { sameMovement } from "@/lib/utils/reconciliation";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(["unmatched", "matched", "ignored"]).optional(),
  matchedCashTransactionId: z.string().optional().nullable(),
});

type RouteContext = {
  params: Promise<{ lineId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lineId } = await context.params;
  const line = await getStatementLineById(lineId);
  if (!line) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, line.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates = { ...parsed.data } as {
    status?: "unmatched" | "matched" | "ignored";
    matchedCashTransactionId?: string | null;
  };

  if (updates.matchedCashTransactionId !== undefined && !updates.status) {
    updates.status = updates.matchedCashTransactionId ? "matched" : "unmatched";
  }

  if (updates.matchedCashTransactionId) {
    const [lines, transactions] = await Promise.all([
      listStatementLines(line.companyId, line.accountId),
      listCashTransactions(line.companyId, line.accountId),
    ]);
    const transaction = transactions.find(
      (entry) => entry.id === updates.matchedCashTransactionId
    );
    const isTaken = lines.some(
      (entry) =>
        entry.id !== lineId &&
        entry.matchedCashTransactionId === updates.matchedCashTransactionId
    );
    if (!transaction || isTaken || !sameMovement(line, transaction)) {
      return NextResponse.json({ error: "Invalid transaction" }, { status: 400 });
    }
  }

  await updateStatementLine(lineId, updates);
  await recordAuditEvent({
    companyId: line.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "reconciliation.update",
    entity: "bank_statement_line",
    entityId: lineId,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}
