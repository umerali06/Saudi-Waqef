import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getExpenseById, updateExpense } from "@/lib/data/expenses";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

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

  const lines = [
    {
      accountId: expense.expenseAccountId,
      debit: expense.netAmount,
      credit: 0,
    },
  ];

  if (expense.taxAmount > 0 && vatInputAccountId) {
    lines.push({
      accountId: vatInputAccountId,
      debit: expense.taxAmount,
      credit: 0,
    });
  }

  lines.push({
    accountId: creditAccountId,
    debit: 0,
    credit: expense.amount,
  });

  const journalEntryId = await createJournalEntry({
    companyId: expense.companyId,
    sourceType: "expense",
    sourceId: expense.id,
    date: expense.expenseDate,
    memo: `Expense ${expense.expenseNumber}`,
    lines,
  });

  await updateExpense(expenseId, {
    status: "approved",
    journalEntryId,
    approvedAt: new Date().toISOString(),
    reimbursementStatus: expense.reimbursable ? "pending" : null,
  });

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
