import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { vendorPaymentSchema } from "@/lib/validators/payments";
import { createVendorPayment, listVendorPayments } from "@/lib/data/vendor-payments";
import { getVendorById } from "@/lib/data/vendors";
import { getPurchaseBillById, updatePurchaseBill } from "@/lib/data/purchase-bills";
import { createBillPayment } from "@/lib/data/bill-payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { updateOpenItemBalance, createOpenItem } from "@/lib/data/open-items";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyCompanyRoles } from "@/lib/notifications/service";

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

  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(parsed.data.companyId),
    listChartAccounts(parsed.data.companyId),
  ]);

  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(parsed.data.accountId)) {
    return NextResponse.json({ error: "Invalid payment account" }, { status: 400 });
  }

  const payableId = defaults.payableAccountId;
  if (!payableId || !accountIds.has(payableId)) {
    return NextResponse.json({ error: "Missing payable account" }, { status: 400 });
  }

  const allocations = [] as Array<{
    billId: string;
    billNumber: string;
    amount: number;
    openItemId?: string | null;
  }>;
  let appliedAmount = 0;

  for (const allocation of parsed.data.allocations) {
    const bill = await getPurchaseBillById(allocation.billId);
    if (!bill || bill.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid bill" }, { status: 400 });
    }
    if (["draft", "canceled"].includes(bill.status)) {
      return NextResponse.json({ error: "Bill is locked" }, { status: 400 });
    }
    if (allocation.amount > bill.balance) {
      return NextResponse.json({ error: "Amount exceeds balance" }, { status: 400 });
    }

    appliedAmount += allocation.amount;
    allocations.push({
      billId: bill.id,
      billNumber: bill.billNumber,
      amount: allocation.amount,
      openItemId: bill.openItemId ?? null,
    });
  }

  if (appliedAmount > parsed.data.totalAmount) {
    return NextResponse.json({ error: "Applied exceeds total" }, { status: 400 });
  }

  const unappliedAmount = Math.max(parsed.data.totalAmount - appliedAmount, 0);

  const journalEntryId = await createJournalEntry({
    companyId: parsed.data.companyId,
    sourceType: "vendor_payment",
    sourceId: null,
    date: parsed.data.paymentDate,
    memo: `Payment to ${vendor.name}`,
    lines: [
      {
        accountId: payableId,
        debit: parsed.data.totalAmount,
        credit: 0,
      },
      {
        accountId: parsed.data.accountId,
        debit: 0,
        credit: parsed.data.totalAmount,
      },
    ],
  });

  const { id, paymentNumber } = await createVendorPayment({
    companyId: parsed.data.companyId,
    paymentDate: parsed.data.paymentDate,
    vendorId: vendor.id,
    vendorName: vendor.name,
    method: parsed.data.method,
    accountId: parsed.data.accountId,
    reference: parsed.data.reference ?? null,
    currency: parsed.data.currency ?? vendor.currency ?? "SAR",
    totalAmount: parsed.data.totalAmount,
    appliedAmount,
    unappliedAmount,
    allocations,
    journalEntryId,
  });

  for (const allocation of allocations) {
    const bill = await getPurchaseBillById(allocation.billId);
    if (!bill) {
      continue;
    }
    const wasPaid = bill.status === "paid";
    const amountPaid = bill.amountPaid + allocation.amount;
    const balance = Math.max(bill.total - amountPaid - bill.amountCredited, 0);
    const status = balance <= 0 ? "paid" : "partially_paid";

    await updatePurchaseBill(bill.id, {
      amountPaid,
      balance,
      status,
    });

    await createBillPayment({
      companyId: bill.companyId,
      billId: bill.id,
      paymentDate: parsed.data.paymentDate,
      amount: allocation.amount,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      accountId: parsed.data.accountId,
      journalEntryId,
    });

    if (bill.openItemId) {
      await updateOpenItemBalance(bill.openItemId, balance);
    }

    if (status === "paid" && !wasPaid) {
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
  }

  if (unappliedAmount > 0) {
    await createOpenItem({
      companyId: parsed.data.companyId,
      partyType: "vendor",
      partyId: vendor.id,
      docType: "vendor_payment_credit",
      docNumber: paymentNumber,
      issueDate: parsed.data.paymentDate,
      dueDate: parsed.data.paymentDate,
      amount: -unappliedAmount,
      balance: -unappliedAmount,
      currency: parsed.data.currency ?? vendor.currency ?? "SAR",
    });
  }

  await createCashTransaction({
    companyId: parsed.data.companyId,
    accountId: parsed.data.accountId,
    date: parsed.data.paymentDate,
    amount: parsed.data.totalAmount,
    direction: "out",
    reference: parsed.data.reference ?? paymentNumber,
    description: `Vendor payment ${paymentNumber}`,
    sourceType: "vendor_payment",
    sourceId: id,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendorPayment.create",
    entity: "vendor_payment",
    entityId: id,
    metadata: { paymentNumber, total: parsed.data.totalAmount },
  });

  return NextResponse.json({ paymentId: id, paymentNumber });
}

