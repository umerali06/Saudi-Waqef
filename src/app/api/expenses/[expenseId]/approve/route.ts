import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getExpenseById, updateExpense } from "@/lib/data/expenses";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { PostingError, postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { roundMoney } from "@/lib/utils/invoice";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ expenseId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId } = await context.params;
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (expense.status !== "draft") {
    return NextResponse.json({ error: "Expense is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, expense.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(
    expense.companyId,
    expense.expenseDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const closedPeriod = await periodClosedResponse(expense.companyId, expense.expenseDate);
  if (closedPeriod) {
    return closedPeriod;
  }

  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(expense.companyId),
    listChartAccounts(expense.companyId),
  ]);

  const accountIds = new Set(accounts.map((account) => account.id));
  const vatInputAccountId = defaults.vatInputAccountId;
  const payableAccountId = defaults.payableAccountId;

  if (!expense.expenseAccountId || !accountIds.has(expense.expenseAccountId)) {
    return NextResponse.json({ error: "Missing expense account" }, { status: 400 });
  }

  let creditAccountId = expense.paymentAccountId ?? null;
  if (expense.reimbursable) {
    if (!payableAccountId || !accountIds.has(payableAccountId)) {
      return NextResponse.json({ error: "Missing payable account" }, { status: 400 });
    }
    creditAccountId = payableAccountId;
  }

  if (!creditAccountId || !accountIds.has(creditAccountId)) {
    return NextResponse.json({ error: "Missing payment account" }, { status: 400 });
  }
  if (expense.taxAmount > 0 && (!vatInputAccountId || !accountIds.has(vatInputAccountId))) {
    return NextResponse.json({ error: "Missing VAT input account" }, { status: 400 });
  }

  const expenseAccountId = expense.expenseAccountId;
  const paymentAccountId = creditAccountId;
  let journalEntryId: string;
  try {
    journalEntryId = await db.runTransaction(async (tx) => {
      const current = await getExpenseById(expenseId, tx);
      if (!current || current.status !== "draft") {
        throw new PostingError("Expense is locked");
      }
      if (
        current.expenseDate !== expense.expenseDate ||
        current.expenseAccountId !== expenseAccountId ||
        current.paymentAccountId !== expense.paymentAccountId ||
        current.reimbursable !== expense.reimbursable ||
        current.taxAmount !== expense.taxAmount
      ) {
        throw new PostingError("Expense changed, try again", 409);
      }
      const netAmount = roundMoney(current.netAmount);
      const taxAmount = roundMoney(current.taxAmount);
      const amount = roundMoney(netAmount + taxAmount);
      const entryId = await createJournalEntry(
        {
          companyId: current.companyId,
          sourceType: "expense",
          sourceId: current.id,
          date: current.expenseDate,
          memo: `Expense ${current.expenseNumber}`,
          lines: [
            { accountId: expenseAccountId, debit: netAmount, credit: 0 },
            ...(taxAmount > 0 && vatInputAccountId
              ? [{ accountId: vatInputAccountId, debit: taxAmount, credit: 0 }]
              : []),
            { accountId: paymentAccountId, debit: 0, credit: amount },
          ],
        },
        tx
      );
      if (!current.reimbursable) {
        await createCashTransaction(
          {
            companyId: current.companyId,
            accountId: paymentAccountId,
            date: current.expenseDate,
            amount,
            direction: "out",
            reference: current.expenseNumber,
            description: `Expense ${current.expenseNumber}`,
            sourceType: "expense",
            sourceId: current.id,
          },
          tx
        );
      }
      await updateExpense(
        expenseId,
        {
          status: "approved",
          netAmount,
          taxAmount,
          amount,
          journalEntryId: entryId,
          approvedAt: new Date().toISOString(),
          reimbursementStatus: current.reimbursable ? "pending" : null,
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
    action: "expense.approve",
    entity: "expense",
    entityId: expense.id,
    metadata: { expenseNumber: expense.expenseNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId });
}
