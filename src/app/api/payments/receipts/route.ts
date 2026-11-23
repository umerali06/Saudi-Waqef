import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { paymentReceiptSchema } from "@/lib/validators/payments";
import {
  createPaymentReceipt,
  getPaymentReceiptById,
  listPaymentReceipts,
} from "@/lib/data/payment-receipts";
import { getCustomerById } from "@/lib/data/customers";
import type { SalesInvoice } from "@/lib/data/sales-invoices";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createOpenItem } from "@/lib/data/open-items";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import {
  assertSameRequest,
  loadSettlementAccount,
  payInvoice,
  readPayableInvoices,
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

  const closedPeriod = await periodClosedResponse(
    parsed.data.companyId,
    parsed.data.receiptDate
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
  const currency = parsed.data.currency ?? customer.currency ?? "SAR";

  const id = parsed.data.requestId ?? uuidv4();
  let receiptNumber: string;
  let paidDocuments: SalesInvoice[] = [];
  try {
    const ledgerAccountId = await loadSettlementAccount(
      parsed.data.companyId,
      "receivable",
      parsed.data.accountId
    );
    const result = await db.runTransaction(async (tx) => {
      const existing = await getPaymentReceiptById(id, tx);
      if (existing) {
        assertSameRequest(
          { companyId: existing.companyId, amount: existing.totalAmount },
          { companyId: parsed.data.companyId, amount: totalAmount }
        );
        return { receiptNumber: existing.receiptNumber, paid: [], duplicate: true };
      }
      const targets = await readPayableInvoices(tx, {
        companyId: parsed.data.companyId,
        customerId: customer.id,
        allocations: parsed.data.allocations,
      });
      const journalEntryId = uuidv4();
      const creditOpenItemId = unappliedAmount > 0 ? uuidv4() : null;
      const created = await createPaymentReceipt(
        {
          id,
          companyId: parsed.data.companyId,
          receiptDate: parsed.data.receiptDate,
          customerId: customer.id,
          customerName: customer.name,
          method: parsed.data.method,
          accountId: parsed.data.accountId,
          reference: parsed.data.reference ?? null,
          currency,
          totalAmount,
          appliedAmount,
          unappliedAmount,
          allocations: targets.map((target) => ({
            invoiceId: target.invoice.id,
            invoiceNumber: target.invoice.invoiceNumber,
            amount: target.amount,
            openItemId: target.invoice.openItemId ?? null,
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
          sourceType: "payment_receipt",
          sourceId: id,
          date: parsed.data.receiptDate,
          memo: `Receipt for ${customer.name}`,
          lines: [
            { accountId: parsed.data.accountId, debit: totalAmount, credit: 0 },
            { accountId: ledgerAccountId, debit: 0, credit: totalAmount },
          ],
        },
        tx
      );
      const paid: SalesInvoice[] = [];
      for (const target of targets) {
        const { status } = await payInvoice(tx, target.invoice, {
          amount: target.amount,
          paymentDate: parsed.data.receiptDate,
          method: parsed.data.method,
          reference: parsed.data.reference ?? null,
          accountId: parsed.data.accountId,
          journalEntryId,
        });
        if (status === "paid") {
          paid.push(target.invoice);
        }
      }
      if (creditOpenItemId) {
        await createOpenItem(
          {
            id: creditOpenItemId,
            companyId: parsed.data.companyId,
            partyType: "customer",
            partyId: customer.id,
            docType: "receipt_credit",
            docNumber: created.receiptNumber,
            sourceId: id,
            issueDate: parsed.data.receiptDate,
            dueDate: parsed.data.receiptDate,
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
          date: parsed.data.receiptDate,
          amount: totalAmount,
          direction: "in",
          reference: parsed.data.reference ?? created.receiptNumber,
          description: `Receipt ${created.receiptNumber}`,
          sourceType: "payment_receipt",
          sourceId: id,
        },
        tx
      );
      return { receiptNumber: created.receiptNumber, paid, duplicate: false };
    });
    receiptNumber = result.receiptNumber;
    paidDocuments = result.paid;
    if (result.duplicate) {
      return NextResponse.json({ receiptId: id, receiptNumber });
    }
  } catch (error) {
    return postingErrorResponse(error);
  }

  for (const invoice of paidDocuments) {
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

