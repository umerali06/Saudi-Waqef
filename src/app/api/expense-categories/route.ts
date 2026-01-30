import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import {
  listExpenseCategories,
  createExpenseCategory,
} from "@/lib/data/expense-categories";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { expenseCategorySchema } from "@/lib/validators/expenses";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";

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

  const status = searchParams.get("status");
  const categories = await listExpenseCategories(companyId);
  const filtered =
    status && status !== "all"
      ? categories.filter((category) => category.status === status)
      : categories;

  return NextResponse.json({
    categories: filtered.map((category) => ({
      id: category.id,
      name: category.name,
      expenseAccountId: category.expenseAccountId,
      status: category.status,
      createdAt: category.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = expenseCategorySchema.safeParse(body);
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

  const accounts = await listChartAccounts(parsed.data.companyId);
  const account = accounts.find(
    (entry) => entry.id === parsed.data.expenseAccountId
  );
  if (!account || !account.isPosting) {
    return NextResponse.json({ error: "Invalid account" }, { status: 400 });
  }

  const id = await createExpenseCategory(parsed.data);
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "expense.category.create",
    entity: "expense_category",
    entityId: id,
    metadata: { name: normalizeSearch(parsed.data.name) },
  });

  return NextResponse.json({ id });
}
