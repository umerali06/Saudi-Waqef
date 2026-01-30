import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getCashBankAccountById,
  updateCashBankAccount,
} from "@/lib/data/cash-bank-accounts";
import { cashBankAccountUpdateSchema } from "@/lib/validators/payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ accountId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await context.params;
  const cashAccount = await getCashBankAccountById(accountId);
  if (!cashAccount) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, cashAccount.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = cashBankAccountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.accountId) {
    const coa = await listChartAccounts(cashAccount.companyId);
    const account = coa.find((entry) => entry.id === parsed.data.accountId);
    if (!account || !account.isPosting) {
      return NextResponse.json({ error: "Invalid account" }, { status: 400 });
    }
  }

  await updateCashBankAccount(accountId, parsed.data);
  await recordAuditEvent({
    companyId: cashAccount.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "cashBankAccount.update",
    entity: "cash_bank_account",
    entityId: accountId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}
