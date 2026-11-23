import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { vendorPaymentSchema } from "@/lib/validators/payments";
import {
  createVendorPayment,
  getVendorPaymentById,
  listVendorPayments,
} from "@/lib/data/vendor-payments";
import { getVendorById } from "@/lib/data/vendors";
import type { PurchaseBill } from "@/lib/data/purchase-bills";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createOpenItem } from "@/lib/data/open-items";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import {
  assertSameRequest,
  loadSettlementAccount,
  payBill,
  readPayableBills,
} from "@/lib/accounting/payments";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { roundMoney } from "@/lib/utils/invoice";

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

  const vendorId = searchParams.get("vendorId");
  const status = searchParams.get("status");
  const q = normalizeSearch(searchParams.get("q") ?? "");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const payments = await listVendorPayments(companyId);
  let filtered = payments;
  if (vendorId) {
    filtered = filtered.filter((payment) => payment.vendorId === vendorId);
  }
  if (from) {
    filtered = filtered.filter((payment) => payment.paymentDate >= from);
  }
  if (to) {
    filtered = filtered.filter((payment) => payment.paymentDate <= to);
  }
  if (status === "unapplied") {
    filtered = filtered.filter((payment) => payment.unappliedAmount > 0);
  }
  if (q) {
    filtered = filtered.filter((payment) => {
      return (
        normalizeSearch(payment.paymentNumber).includes(q) ||
        normalizeSearch(payment.vendorName).includes(q)
      );
    });
  }

  filtered.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  return NextResponse.json({
    payments: filtered.map((payment) => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      vendorId: payment.vendorId,
      vendorName: payment.vendorName,
      method: payment.method,
      accountId: payment.accountId,
      totalAmount: payment.totalAmount,
      appliedAmount: payment.appliedAmount,
      unappliedAmount: payment.unappliedAmount,
      currency: payment.currency,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vendorPaymentSchema.safeParse(body);
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

  const vendor = await getVendorById(parsed.data.vendorId);
  if (!vendor || vendor.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid vendor" }, { status: 400 });
  }
  if (vendor.status === "inactive") {
    return NextResponse.json({ error: "Vendor is inactive" }, { status: 400 });
  }

  const closedPeriod = await periodClosedResponse(
    parsed.data.companyId,
    parsed.data.paymentDate
  );
  if (closedPeriod) {
    return closedPeriod;
  }

  const totalAmount = roundMoney(parsed.data.totalAmount);
  const appliedAmount = roundMoney(
    parsed.data.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
  );
  if (appliedAmount > totalAmount) {
    return NextResponse.json({ error: "Applied exceeds total" }, { status: 400 });
  }
  const unappliedAmount = roundMoney(totalAmount - appliedAmount);
  const currency = parsed.data.currency ?? vendor.currency ?? "SAR";

  const id = parsed.data.requestId ?? uuidv4();
  let paymentNumber: string;
  let paidDocuments: PurchaseBill[] = [];
  try {
    const ledgerAccountId = await loadSettlementAccount(
      parsed.data.companyId,
      "payable",
      parsed.data.accountId
    );
    const result = await db.runTransaction(async (tx) => {
      const existing = await getVendorPaymentById(id, tx);
      if (existing) {
        assertSameRequest(
          { companyId: existing.companyId, amount: existing.totalAmount },
          { companyId: parsed.data.companyId, amount: totalAmount }
        );
        return { paymentNumber: existing.paymentNumber, paid: [], duplicate: true };
      }
      const targets = await readPayableBills(tx, {
        companyId: parsed.data.companyId,
        vendorId: vendor.id,
        allocations: parsed.data.allocations,
      });
      const journalEntryId = uuidv4();
      const creditOpenItemId = unappliedAmount > 0 ? uuidv4() : null;
      const created = await createVendorPayment(
        {
          id,
          companyId: parsed.data.companyId,
          paymentDate: parsed.data.paymentDate,
          vendorId: vendor.id,
          vendorName: vendor.name,
          method: parsed.data.method,
          accountId: parsed.data.accountId,
          reference: parsed.data.reference ?? null,
          currency,
          totalAmount,
          appliedAmount,
          unappliedAmount,
          allocations: targets.map((target) => ({
            billId: target.bill.id,
            billNumber: target.bill.billNumber,
            amount: target.amount,
            openItemId: target.bill.openItemId ?? null,
          })),
          journalEntryId,
          creditOpenItemId,
        },
        tx
      );
      await createJournalEntry(
        {
          id: journalEntryId,
          companyId: parsed.data.companyId,
          sourceType: "vendor_payment",
          sourceId: id,
          date: parsed.data.paymentDate,
          memo: `Payment to ${vendor.name}`,
          lines: [
            { accountId: ledgerAccountId, debit: totalAmount, credit: 0 },
            { accountId: parsed.data.accountId, debit: 0, credit: totalAmount },
          ],
        },
        tx
      );
      const paid: PurchaseBill[] = [];
      for (const target of targets) {
        const { status } = await payBill(tx, target.bill, {
          amount: target.amount,
          paymentDate: parsed.data.paymentDate,
          method: parsed.data.method,
          reference: parsed.data.reference ?? null,
          accountId: parsed.data.accountId,
          journalEntryId,
        });
        if (status === "paid") {
          paid.push(target.bill);
        }
      }
      if (creditOpenItemId) {
        await createOpenItem(
          {
            id: creditOpenItemId,
            companyId: parsed.data.companyId,
            partyType: "vendor",
            partyId: vendor.id,
            docType: "vendor_payment_credit",
            docNumber: created.paymentNumber,
            sourceId: id,
            issueDate: parsed.data.paymentDate,
            dueDate: parsed.data.paymentDate,
            amount: -unappliedAmount,
            balance: -unappliedAmount,
            currency,
          },
          tx
        );
      }
      await createCashTransaction(
        {
          companyId: parsed.data.companyId,
          accountId: parsed.data.accountId,
          date: parsed.data.paymentDate,
          amount: totalAmount,
          direction: "out",
          reference: parsed.data.reference ?? created.paymentNumber,
          description: `Vendor payment ${created.paymentNumber}`,
          sourceType: "vendor_payment",
          sourceId: id,
        },
        tx
      );
      return { paymentNumber: created.paymentNumber, paid, duplicate: false };
    });
    paymentNumber = result.paymentNumber;
    paidDocuments = result.paid;
    if (result.duplicate) {
      return NextResponse.json({ paymentId: id, paymentNumber });
    }
  } catch (error) {
    return postingErrorResponse(error);
  }

  for (const bill of paidDocuments) {
    await notifyCompanyRoles({
      companyId: bill.companyId,
      roles: ["owner", "admin", "accountant"],
      type: "bill_paid",
      actorId: user.id,
      data: {
        billNumber: bill.billNumber,
        amount: `${bill.total}`,
        currency: bill.currency ?? "SAR",
      },
    });
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendorPayment.create",
    entity: "vendor_payment",
    entityId: id,
    metadata: { paymentNumber, total: totalAmount },
  });

  return NextResponse.json({ paymentId: id, paymentNumber });
}

