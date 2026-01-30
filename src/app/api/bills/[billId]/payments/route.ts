import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { billPaymentSchema } from "@/lib/validators/purchases";
import { getPurchaseBillById, updatePurchaseBill } from "@/lib/data/purchase-bills";
import { listBillPayments, createBillPayment } from "@/lib/data/bill-payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { updateOpenItemBalance } from "@/lib/data/open-items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ billId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billId } = await context.params;
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, bill.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payments = await listBillPayments(billId);
  return NextResponse.json({ payments });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = billPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { billId } = await context.params;
  const bill = await getPurchaseBillById(billId);
  if (!bill || bill.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (["draft", "canceled"].includes(bill.status)) {
    return NextResponse.json({ error: "Bill is locked" }, { status: 400 });
  }

  if (parsed.data.amount > bill.balance) {
    return NextResponse.json({ error: "Amount exceeds balance" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(bill.companyId),
    listChartAccounts(bill.companyId),
  ]);

  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(parsed.data.accountId)) {
    return NextResponse.json({ error: "Invalid payment account" }, { status: 400 });
  }

  const payableId = defaults.payableAccountId;
  if (!payableId || !accountIds.has(payableId)) {
    return NextResponse.json({ error: "Missing payable account" }, { status: 400 });
  }

  const journalEntryId = await createJournalEntry({
    companyId: bill.companyId,
    sourceType: "bill_payment",
    sourceId: bill.id,
    date: parsed.data.paymentDate,
    memo: `Payment for ${bill.billNumber}`,
    lines: [
      {
        accountId: payableId,
        debit: parsed.data.amount,
        credit: 0,
      },
      {
        accountId: parsed.data.accountId,
        debit: 0,
        credit: parsed.data.amount,
      },
    ],
  });

  const paymentId = await createBillPayment({
    companyId: bill.companyId,
    billId: bill.id,
    paymentDate: parsed.data.paymentDate,
    amount: parsed.data.amount,
    method: parsed.data.method,
    reference: parsed.data.reference ?? null,
    accountId: parsed.data.accountId,
    journalEntryId,
  });

  const amountPaid = bill.amountPaid + parsed.data.amount;
  const balance = Math.max(bill.total - amountPaid - bill.amountCredited, 0);
  const status = balance <= 0 ? "paid" : "partially_paid";

  await updatePurchaseBill(billId, {
    amountPaid,
    balance,
    status,
  });

  if (bill.openItemId) {
    await updateOpenItemBalance(bill.openItemId, balance);
  }

  await recordAuditEvent({
    companyId: bill.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.payment",
    entity: "purchase_bill",
    entityId: bill.id,
    metadata: { paymentId, amount: parsed.data.amount },
  });

  if (status === "paid") {
    await notifyCompanyRoles({
      companyId: bill.companyId,
      roles: ["owner", "admin", "accountant"],
      type: "bill_paid",
      actorId: user.id,
      data: {
        billNumber: bill.billNumber,
        amount: `${parsed.data.amount}`,
        currency: bill.currency ?? "SAR",
      },
    });
  }

  return NextResponse.json({ ok: true, paymentId });
}
