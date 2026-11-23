import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { billPaymentSchema } from "@/lib/validators/purchases";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
import { getBillPayment, listBillPayments } from "@/lib/data/bill-payments";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import {
  assertSameRequest,
  loadSettlementAccount,
  payBill,
  readPayableBills,
} from "@/lib/accounting/payments";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { roundMoney } from "@/lib/utils/invoice";

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

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const closedPeriod = await periodClosedResponse(
    bill.companyId,
    parsed.data.paymentDate
  );
  if (closedPeriod) {
    return closedPeriod;
  }

  const amount = roundMoney(parsed.data.amount);
  const paymentId = parsed.data.requestId ?? uuidv4();
  let result: { status: string; duplicate: boolean };
  try {
    const ledgerAccountId = await loadSettlementAccount(
      bill.companyId,
      "payable",
      parsed.data.accountId
    );
    result = await db.runTransaction(async (tx) => {
      const existing = await getBillPayment(paymentId, tx);
      if (existing) {
        assertSameRequest(existing, { companyId: bill.companyId, amount });
        return { status: bill.status, duplicate: true };
      }
      const [{ bill: current }] = await readPayableBills(tx, {
        companyId: bill.companyId,
        allocations: [{ billId: bill.id, amount }],
      });
      const journalEntryId = uuidv4();
      const { status } = await payBill(tx, current, {
        id: paymentId,
        amount,
        paymentDate: parsed.data.paymentDate,
        method: parsed.data.method,
        reference: parsed.data.reference ?? null,
        accountId: parsed.data.accountId,
        journalEntryId,
      });
      await createJournalEntry(
        {
          id: journalEntryId,
          companyId: bill.companyId,
          sourceType: "bill_payment",
          sourceId: bill.id,
          date: parsed.data.paymentDate,
          memo: `Payment for ${bill.billNumber}`,
          lines: [
            { accountId: ledgerAccountId, debit: amount, credit: 0 },
            { accountId: parsed.data.accountId, debit: 0, credit: amount },
          ],
        },
        tx
      );
      await createCashTransaction(
        {
          companyId: bill.companyId,
          accountId: parsed.data.accountId,
          date: parsed.data.paymentDate,
          amount,
          direction: "out",
          reference: parsed.data.reference ?? bill.billNumber,
          description: `Payment ${bill.billNumber}`,
          sourceType: "bill_payment",
          sourceId: paymentId,
        },
        tx
      );
      return { status, duplicate: false };
    });
  } catch (error) {
    return postingErrorResponse(error);
  }
  if (result.duplicate) {
    return NextResponse.json({ ok: true, paymentId });
  }
  const { status } = result;

  await recordAuditEvent({
    companyId: bill.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.payment",
    entity: "purchase_bill",
    entityId: bill.id,
    metadata: { paymentId, amount },
  });

  if (status === "paid") {
    await notifyCompanyRoles({
      companyId: bill.companyId,
      roles: ["owner", "admin", "accountant"],
      type: "bill_paid",
      actorId: user.id,
      data: {
        billNumber: bill.billNumber,
        amount: `${amount}`,
        currency: bill.currency ?? "SAR",
      },
    });
  }

  return NextResponse.json({ ok: true, paymentId });
}
