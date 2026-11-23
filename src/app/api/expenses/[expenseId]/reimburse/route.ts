import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { expenseReimbursementSchema } from "@/lib/validators/expenses";
import { getExpenseById, updateExpense } from "@/lib/data/expenses";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { PostingError, postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { roundMoney } from "@/lib/utils/invoice";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ expenseId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId } = await context.params;
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!expense.reimbursable) {
    return NextResponse.json({ error: "Expense is not reimbursable" }, { status: 400 });
  }
  if (expense.status !== "approved") {
    return NextResponse.json({ error: "Expense is not approved" }, { status: 400 });
  }
  if (expense.reimbursementStatus === "paid") {
    return NextResponse.json({ error: "Reimbursement already paid" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = expenseReimbursementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, expense.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.companyId !== expense.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(expense.companyId),
    listChartAccounts(expense.companyId),
  ]);

  const accountIds = new Set(accounts.map((account) => account.id));
  const payableAccountId = defaults.payableAccountId;

  if (!payableAccountId || !accountIds.has(payableAccountId)) {
    return NextResponse.json({ error: "Missing payable account" }, { status: 400 });
  }
  if (!accountIds.has(parsed.data.paymentAccountId)) {
    return NextResponse.json({ error: "Invalid payment account" }, { status: 400 });
  }

  const closedPeriod = await periodClosedResponse(
    expense.companyId,
    parsed.data.paymentDate
  );
  if (closedPeriod) {
    return closedPeriod;
  }

  let journalEntryId: string;
  try {
    journalEntryId = await db.runTransaction(async (tx) => {
      const current = await getExpenseById(expenseId, tx);
      if (!current || current.status !== "approved") {
        throw new PostingError("Expense is not approved");
      }
      if (current.reimbursementStatus === "paid") {
        throw new PostingError("Reimbursement already paid");
      }
      const amount = roundMoney(current.amount);
      const entryId = await createJournalEntry(
        {
          companyId: current.companyId,
          sourceType: "expense_reimbursement",
          sourceId: current.id,
          date: parsed.data.paymentDate,
          memo: `Expense reimbursement ${current.expenseNumber}`,
          lines: [
            { accountId: payableAccountId, debit: amount, credit: 0 },
            { accountId: parsed.data.paymentAccountId, debit: 0, credit: amount },
          ],
        },
        tx
      );
      await createCashTransaction(
        {
          companyId: current.companyId,
          accountId: parsed.data.paymentAccountId,
          date: parsed.data.paymentDate,
          amount,
          direction: "out",
          reference: parsed.data.reference ?? current.expenseNumber,
          description: `Expense reimbursement ${current.expenseNumber}`,
          sourceType: "expense_reimbursement",
          sourceId: current.id,
        },
        tx
      );
      await updateExpense(
        expenseId,
        {
          reimbursementStatus: "paid",
          reimbursedAt: parsed.data.paymentDate,
          reimbursementEntryId: entryId,
          reimbursementMethod: parsed.data.paymentMethod,
          reimbursementAccountId: parsed.data.paymentAccountId,
          reimbursementReference: parsed.data.reference ?? null,
        },
        tx
      );
      return entryId;
    });
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: expense.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "expense.reimburse",
    entity: "expense",
    entityId: expense.id,
    metadata: { expenseNumber: expense.expenseNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId });
}
