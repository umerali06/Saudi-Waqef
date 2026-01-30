import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { expenseReimbursementSchema } from "@/lib/validators/expenses";
import { getExpenseById, updateExpense } from "@/lib/data/expenses";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { recordAuditEvent } from "@/lib/data/audit-log";

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

  const journalEntryId = await createJournalEntry({
    companyId: expense.companyId,
    sourceType: "expense_reimbursement",
    sourceId: expense.id,
    date: parsed.data.paymentDate,
    memo: `Expense reimbursement ${expense.expenseNumber}`,
    lines: [
      { accountId: payableAccountId, debit: expense.amount, credit: 0 },
      { accountId: parsed.data.paymentAccountId, debit: 0, credit: expense.amount },
    ],
  });

  await updateExpense(expenseId, {
    reimbursementStatus: "paid",
    reimbursedAt: parsed.data.paymentDate,
    reimbursementEntryId: journalEntryId,
    reimbursementMethod: parsed.data.paymentMethod,
    reimbursementAccountId: parsed.data.paymentAccountId,
    reimbursementReference: parsed.data.reference ?? null,
  });

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
