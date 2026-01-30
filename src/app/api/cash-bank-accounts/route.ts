import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import {
  listCashBankAccounts,
  createCashBankAccount,
} from "@/lib/data/cash-bank-accounts";
import { cashBankAccountSchema } from "@/lib/validators/payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
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

  const accounts = await listCashBankAccounts(companyId);
  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = cashBankAccountSchema.safeParse(body);
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

  const coa = await listChartAccounts(parsed.data.companyId);
  const account = coa.find((entry) => entry.id === parsed.data.accountId);
  if (!account || !account.isPosting) {
    return NextResponse.json({ error: "Invalid account" }, { status: 400 });
  }

  const id = await createCashBankAccount(parsed.data);
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "cashBankAccount.create",
    entity: "cash_bank_account",
    entityId: id,
    metadata: { name: parsed.data.name },
  });

  return NextResponse.json({ id });
}

