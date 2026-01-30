import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { paymentReceiptSchema } from "@/lib/validators/payments";
import { createPaymentReceipt, listPaymentReceipts } from "@/lib/data/payment-receipts";
import { getCustomerById } from "@/lib/data/customers";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { createInvoicePayment } from "@/lib/data/invoice-payments";
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

  const customerId = searchParams.get("customerId");
  const status = searchParams.get("status");
  const q = normalizeSearch(searchParams.get("q") ?? "");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const receipts = await listPaymentReceipts(companyId);
  let filtered = receipts;
  if (customerId) {
    filtered = filtered.filter((receipt) => receipt.customerId === customerId);
  }
  if (from) {
    filtered = filtered.filter((receipt) => receipt.receiptDate >= from);
  }
  if (to) {
    filtered = filtered.filter((receipt) => receipt.receiptDate <= to);
  }
  if (status === "unapplied") {
    filtered = filtered.filter((receipt) => receipt.unappliedAmount > 0);
  }
  if (q) {
    filtered = filtered.filter((receipt) => {
      return (
        normalizeSearch(receipt.receiptNumber).includes(q) ||
        normalizeSearch(receipt.customerName).includes(q)
      );
    });
  }

  filtered.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate));

  return NextResponse.json({
    receipts: filtered.map((receipt) => ({
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      receiptDate: receipt.receiptDate,
      customerId: receipt.customerId,
      customerName: receipt.customerName,
      method: receipt.method,
      accountId: receipt.accountId,
      totalAmount: receipt.totalAmount,
      appliedAmount: receipt.appliedAmount,
      unappliedAmount: receipt.unappliedAmount,
      currency: receipt.currency,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentReceiptSchema.safeParse(body);
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

  const customer = await getCustomerById(parsed.data.customerId);
  if (!customer || customer.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  }
  if (customer.status === "blacklisted") {
    return NextResponse.json({ error: "Customer is blacklisted" }, { status: 400 });
  }

  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(parsed.data.companyId),
    listChartAccounts(parsed.data.companyId),
  ]);

  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(parsed.data.accountId)) {
    return NextResponse.json({ error: "Invalid payment account" }, { status: 400 });
  }

  const receivableId = defaults.receivableAccountId;
  if (!receivableId || !accountIds.has(receivableId)) {
    return NextResponse.json({ error: "Missing receivable account" }, { status: 400 });
  }

  const allocations = [];
  let appliedAmount = 0;

  for (const allocation of parsed.data.allocations) {
    const invoice = await getSalesInvoiceById(allocation.invoiceId);
    if (!invoice || invoice.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid invoice" }, { status: 400 });
    }
    if (["draft", "canceled"].includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice is locked" }, { status: 400 });
    }
    if (allocation.amount > invoice.balance) {
      return NextResponse.json({ error: "Amount exceeds balance" }, { status: 400 });
    }

    appliedAmount += allocation.amount;
    allocations.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: allocation.amount,
      openItemId: invoice.openItemId ?? null,
    });
  }

  if (appliedAmount > parsed.data.totalAmount) {
    return NextResponse.json({ error: "Applied exceeds total" }, { status: 400 });
  }

  const unappliedAmount = Math.max(parsed.data.totalAmount - appliedAmount, 0);

  const journalEntryId = await createJournalEntry({
    companyId: parsed.data.companyId,
    sourceType: "payment_receipt",
    sourceId: null,
    date: parsed.data.receiptDate,
    memo: `Receipt for ${customer.name}`,
    lines: [
      {
        accountId: parsed.data.accountId,
        debit: parsed.data.totalAmount,
        credit: 0,
      },
      {
        accountId: receivableId,
        debit: 0,
        credit: parsed.data.totalAmount,
      },
    ],
  });

  const { id, receiptNumber } = await createPaymentReceipt({
    companyId: parsed.data.companyId,
    receiptDate: parsed.data.receiptDate,
    customerId: customer.id,
    customerName: customer.name,
    method: parsed.data.method,
    accountId: parsed.data.accountId,
    reference: parsed.data.reference ?? null,
    currency: parsed.data.currency ?? customer.currency ?? "SAR",
    totalAmount: parsed.data.totalAmount,
    appliedAmount,
    unappliedAmount,
    allocations,
    journalEntryId,
  });

  for (const allocation of allocations) {
    const invoice = await getSalesInvoiceById(allocation.invoiceId);
    if (!invoice) {
      continue;
    }
    const wasPaid = invoice.status === "paid";
    const amountPaid = invoice.amountPaid + allocation.amount;
    const balance = Math.max(invoice.total - amountPaid - invoice.amountCredited, 0);
    const status = balance <= 0 ? "paid" : "partially_paid";

    await updateSalesInvoice(invoice.id, {
      amountPaid,
      balance,
      status,
    });

    await createInvoicePayment({
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      paymentDate: parsed.data.receiptDate,
      amount: allocation.amount,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      accountId: parsed.data.accountId,
      journalEntryId,
    });

    if (invoice.openItemId) {
      await updateOpenItemBalance(invoice.openItemId, balance);
    }

    if (status === "paid" && !wasPaid) {
      await notifyCompanyRoles({
        companyId: invoice.companyId,
        roles: ["owner", "admin", "accountant"],
        type: "invoice_paid",
        actorId: user.id,
        data: {
          invoiceNumber: invoice.invoiceNumber,
          amount: `${invoice.total}`,
          currency: invoice.currency ?? "SAR",
        },
      });
    }
  }

  if (unappliedAmount > 0) {
    await createOpenItem({
      companyId: parsed.data.companyId,
      partyType: "customer",
      partyId: customer.id,
      docType: "receipt_credit",
      docNumber: receiptNumber,
      issueDate: parsed.data.receiptDate,
      dueDate: parsed.data.receiptDate,
      amount: -unappliedAmount,
      balance: -unappliedAmount,
      currency: parsed.data.currency ?? customer.currency ?? "SAR",
    });
  }

  await createCashTransaction({
    companyId: parsed.data.companyId,
    accountId: parsed.data.accountId,
    date: parsed.data.receiptDate,
    amount: parsed.data.totalAmount,
    direction: "in",
    reference: parsed.data.reference ?? receiptNumber,
    description: `Receipt ${receiptNumber}`,
    sourceType: "payment_receipt",
    sourceId: id,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "receipt.create",
    entity: "payment_receipt",
    entityId: id,
    metadata: { receiptNumber },
  });

  return NextResponse.json({ receiptId: id, receiptNumber });
}

