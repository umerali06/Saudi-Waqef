import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getExpenseCategoryById,
  updateExpenseCategory,
} from "@/lib/data/expense-categories";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { expenseCategoryUpdateSchema } from "@/lib/validators/expenses";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ categoryId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { categoryId } = await context.params;
  const category = await getExpenseCategoryById(categoryId);
  if (!category) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, category.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = expenseCategoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.expenseAccountId) {
    const accounts = await listChartAccounts(category.companyId);
    const account = accounts.find(
      (entry) => entry.id === parsed.data.expenseAccountId
    );
    if (!account || !account.isPosting) {
      return NextResponse.json({ error: "Invalid account" }, { status: 400 });
    }
  }

  await updateExpenseCategory(categoryId, parsed.data);
  await recordAuditEvent({
    companyId: category.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "expense.category.update",
    entity: "expense_category",
    entityId: categoryId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}
