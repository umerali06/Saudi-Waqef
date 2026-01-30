import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { expenseSchema } from "@/lib/validators/expenses";
import { listExpenses, createExpense } from "@/lib/data/expenses";
import { getExpenseCategoryById } from "@/lib/data/expense-categories";
import { getVendorById } from "@/lib/data/vendors";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

const parseBoolean = (value: string | null) => {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeSearch(value);
  if (["true", "yes", "1", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
};

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

  const status = searchParams.get("status");
  const categoryId = searchParams.get("categoryId");
  const paymentMethod = searchParams.get("paymentMethod");
  const reimbursable = parseBoolean(searchParams.get("reimbursable"));
  const reimbursementStatus = searchParams.get("reimbursementStatus");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = normalizeSearch(searchParams.get("q") ?? "");

  const expenses = await listExpenses(companyId);

  let filtered = expenses;
  if (status && status !== "all") {
    filtered = filtered.filter((expense) => expense.status === status);
  }
  if (categoryId) {
    filtered = filtered.filter((expense) => expense.categoryId === categoryId);
  }
  if (paymentMethod && paymentMethod !== "all") {
    filtered = filtered.filter((expense) => expense.paymentMethod === paymentMethod);
  }
  if (reimbursable !== undefined) {
    filtered = filtered.filter((expense) => expense.reimbursable === reimbursable);
  }
  if (reimbursementStatus && reimbursementStatus !== "all") {
    filtered = filtered.filter(
      (expense) => expense.reimbursementStatus === reimbursementStatus
    );
  }
  if (from) {
    filtered = filtered.filter((expense) => expense.expenseDate >= from);
  }
  if (to) {
    filtered = filtered.filter((expense) => expense.expenseDate <= to);
  }
  if (q) {
    filtered = filtered.filter((expense) => {
      return (
        normalizeSearch(expense.expenseNumber).includes(q) ||
        normalizeSearch(expense.vendorName ?? "").includes(q) ||
        normalizeSearch(expense.categoryName).includes(q) ||
        normalizeSearch(expense.description ?? "").includes(q)
      );
    });
  }

  filtered.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));

  return NextResponse.json({
    expenses: filtered.map((expense) => ({
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      expenseDate: expense.expenseDate,
      categoryId: expense.categoryId,
      categoryName: expense.categoryName,
      vendorId: expense.vendorId ?? null,
      vendorName: expense.vendorName ?? null,
      status: expense.status,
      paymentMethod: expense.paymentMethod,
      reimbursable: expense.reimbursable,
      reimbursementStatus: expense.reimbursementStatus ?? null,
      total: expense.amount,
      currency: expense.currency,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = expenseSchema.safeParse(body);
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

  const lockedPeriod = await findFiledVatPeriod(
    parsed.data.companyId,
    parsed.data.expenseDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const category = await getExpenseCategoryById(parsed.data.categoryId);
  if (!category || category.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (category.status !== "active") {
    return NextResponse.json({ error: "Category is inactive" }, { status: 400 });
  }

  let vendorName: string | null = null;
  if (parsed.data.vendorId) {
    const vendor = await getVendorById(parsed.data.vendorId);
    if (!vendor || vendor.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid vendor" }, { status: 400 });
    }
    if (vendor.status !== "active") {
      return NextResponse.json({ error: "Vendor is inactive" }, { status: 400 });
    }
    vendorName = vendor.name;
  }

  const [taxCategories, defaults, config, accounts] = await Promise.all([
    listTaxCategories(parsed.data.companyId),
    getCompanyDefaults(parsed.data.companyId),
    getCompanyConfig(parsed.data.companyId),
    listChartAccounts(parsed.data.companyId),
  ]);

  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));
  const accountIds = new Set(
    accounts.filter((account) => account.isPosting).map((account) => account.id)
  );

  const taxCategoryId =
    parsed.data.taxCategoryId ?? defaults.defaultPurchaseTaxCategoryId ?? null;
  const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
  const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;

  const amounts = calculateLineAmounts({
    quantity: 1,
    unitPrice: parsed.data.amount,
    discountRate: 0,
    taxRate,
    taxInclusive: Boolean(config.taxInclusive),
  });

  const reimbursable = Boolean(parsed.data.reimbursable);
  const paymentAccountId = parsed.data.paymentAccountId ?? null;
  if (!reimbursable && (!paymentAccountId || !accountIds.has(paymentAccountId))) {
    return NextResponse.json({ error: "Missing payment account" }, { status: 400 });
  }

  const { id, expenseNumber } = await createExpense({
    companyId: parsed.data.companyId,
    expenseDate: parsed.data.expenseDate,
    categoryId: category.id,
    categoryName: category.name,
    expenseAccountId: category.expenseAccountId,
    vendorId: parsed.data.vendorId ?? null,
    vendorName,
    paymentMethod: parsed.data.paymentMethod,
    paymentAccountId,
    currency: parsed.data.currency ?? "SAR",
    amount: amounts.totalAmount,
    netAmount: amounts.netAmount,
    taxAmount: amounts.taxAmount,
    taxRate,
    taxCategoryId,
    taxInclusive: Boolean(config.taxInclusive),
    description: parsed.data.description ?? null,
    notes: parsed.data.notes ?? null,
    reimbursable,
    reimbursementStatus: reimbursable ? "pending" : null,
    reimburseTo: parsed.data.reimburseTo ?? null,
    status: "draft",
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "expense.create",
    entity: "expense",
    entityId: id,
    metadata: { expenseNumber },
  });

  return NextResponse.json({ expenseId: id, expenseNumber });
}

