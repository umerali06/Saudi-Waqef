import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { expenseUpdateSchema } from "@/lib/validators/expenses";
import { getExpenseById, updateExpense } from "@/lib/data/expenses";
import { getExpenseCategoryById } from "@/lib/data/expense-categories";
import { getVendorById } from "@/lib/data/vendors";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ expenseId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId } = await context.params;
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, expense.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ expense });
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const body = await request.json().catch(() => null);
  const parsed = expenseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates = parsed.data;

  const targetDate = updates.expenseDate ?? expense.expenseDate;
  const lockedPeriod = await findFiledVatPeriod(expense.companyId, targetDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  let categoryName = expense.categoryName;
  let expenseAccountId = expense.expenseAccountId;
  if (updates.categoryId) {
    const category = await getExpenseCategoryById(updates.categoryId);
    if (!category || category.companyId !== expense.companyId) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (category.status !== "active") {
      return NextResponse.json({ error: "Category is inactive" }, { status: 400 });
    }
    categoryName = category.name;
    expenseAccountId = category.expenseAccountId;
  }

  let vendorId = expense.vendorId ?? null;
  let vendorName = expense.vendorName ?? null;
  if (updates.vendorId !== undefined) {
    if (updates.vendorId) {
      const vendor = await getVendorById(updates.vendorId);
      if (!vendor || vendor.companyId !== expense.companyId) {
        return NextResponse.json({ error: "Invalid vendor" }, { status: 400 });
      }
      if (vendor.status !== "active") {
        return NextResponse.json({ error: "Vendor is inactive" }, { status: 400 });
      }
      vendorId = vendor.id;
      vendorName = vendor.name;
    } else {
      vendorId = null;
      vendorName = null;
    }
  }

  const [taxCategories, defaults, accounts] = await Promise.all([
    listTaxCategories(expense.companyId),
    getCompanyDefaults(expense.companyId),
    listChartAccounts(expense.companyId),
  ]);

  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));
  const accountIds = new Set(
    accounts.filter((account) => account.isPosting).map((account) => account.id)
  );

  const taxCategoryId =
    updates.taxCategoryId ??
    expense.taxCategoryId ??
    defaults.defaultPurchaseTaxCategoryId ??
    null;
  const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
  const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;

  const amount =
    updates.amount ??
    (expense.taxInclusive ? expense.amount : expense.netAmount);
  const amounts = calculateLineAmounts({
    quantity: 1,
    unitPrice: amount,
    discountRate: 0,
    taxRate,
    taxInclusive: Boolean(expense.taxInclusive),
  });

  const reimbursable =
    updates.reimbursable !== undefined ? updates.reimbursable : expense.reimbursable;
  const paymentAccountId =
    updates.paymentAccountId !== undefined
      ? updates.paymentAccountId
      : expense.paymentAccountId ?? null;
  if (!reimbursable && (!paymentAccountId || !accountIds.has(paymentAccountId))) {
    return NextResponse.json({ error: "Missing payment account" }, { status: 400 });
  }

  const nextReimbursementStatus = reimbursable
    ? updates.reimbursementStatus ?? expense.reimbursementStatus ?? "pending"
    : null;

  await updateExpense(expenseId, {
    expenseDate: updates.expenseDate ?? expense.expenseDate,
    categoryId: updates.categoryId ?? expense.categoryId,
    categoryName,
    expenseAccountId,
    vendorId,
    vendorName,
    paymentMethod: updates.paymentMethod ?? expense.paymentMethod,
    paymentAccountId: paymentAccountId ?? null,
    currency: updates.currency ?? expense.currency,
    amount: amounts.totalAmount,
    netAmount: amounts.netAmount,
    taxAmount: amounts.taxAmount,
    taxRate,
    taxCategoryId,
    taxInclusive: Boolean(expense.taxInclusive),
    description: updates.description ?? expense.description ?? null,
    notes: updates.notes ?? expense.notes ?? null,
    reimbursable,
    reimbursementStatus: nextReimbursementStatus,
    reimburseTo: updates.reimburseTo ?? expense.reimburseTo ?? null,
  });

  await recordAuditEvent({
    companyId: expense.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "expense.update",
    entity: "expense",
    entityId: expenseId,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

