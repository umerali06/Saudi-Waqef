import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesCreditNoteById, updateSalesCreditNote } from "@/lib/data/credit-notes";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { updateOpenItemBalance } from "@/lib/data/open-items";
import { listItems, applyItemStockDeltas } from "@/lib/data/items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ creditNoteId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creditNoteId } = await context.params;
  const note = await getSalesCreditNoteById(creditNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (note.status !== "draft") {
    return NextResponse.json({ error: "Credit note is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, note.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(note.companyId, note.issueDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const [invoice, defaults, accounts, items] = await Promise.all([
    getSalesInvoiceById(note.invoiceId),
    getCompanyDefaults(note.companyId),
    listChartAccounts(note.companyId),
    listItems(note.companyId),
  ]);

  if (!invoice) {
    return NextResponse.json({ error: "Invalid invoice" }, { status: 400 });
  }

  if (invoice.status === "canceled") {
    return NextResponse.json({ error: "Invoice is canceled" }, { status: 400 });
  }

  if (note.total > invoice.balance) {
    return NextResponse.json({ error: "Credit exceeds balance" }, { status: 400 });
  }

  const accountIds = new Set(accounts.map((account) => account.id));
  const receivableId = defaults.receivableAccountId;
  const salesAccountId = defaults.salesAccountId;
  const vatOutputAccountId = defaults.vatOutputAccountId;
  const discountAccountId = defaults.discountAccountId;

  if (!receivableId || !accountIds.has(receivableId)) {
    return NextResponse.json({ error: "Missing receivable account" }, { status: 400 });
  }
  if (!salesAccountId || !accountIds.has(salesAccountId)) {
    return NextResponse.json({ error: "Missing sales account" }, { status: 400 });
  }
  if (note.taxTotal > 0 && (!vatOutputAccountId || !accountIds.has(vatOutputAccountId))) {
    return NextResponse.json({ error: "Missing VAT output account" }, { status: 400 });
  }
  if (note.discountTotal > 0 && (!discountAccountId || !accountIds.has(discountAccountId))) {
    return NextResponse.json({ error: "Missing discount account" }, { status: 400 });
  }

  const grossSales =
    discountAccountId && note.discountTotal > 0
      ? note.subtotal + note.discountTotal
      : note.subtotal;

  const journalLines = [
    {
      accountId: receivableId,
      debit: 0,
      credit: note.total,
    },
    {
      accountId: salesAccountId,
      debit: grossSales,
      credit: 0,
    },
  ];

  if (discountAccountId && note.discountTotal > 0) {
    journalLines.push({
      accountId: discountAccountId,
      debit: 0,
      credit: note.discountTotal,
    });
  }
  if (note.taxTotal > 0 && vatOutputAccountId) {
    journalLines.push({
      accountId: vatOutputAccountId,
      debit: note.taxTotal,
      credit: 0,
    });
  }

  const journalEntryId = await createJournalEntry({
    companyId: note.companyId,
    sourceType: "sales_credit_note",
    sourceId: note.id,
    date: note.issueDate,
    memo: `Credit note ${note.creditNumber}`,
    lines: journalLines,
  });

  await updateSalesCreditNote(creditNoteId, { journalEntryId, status: "issued" });

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const stockUpdates: Array<{ itemId: string; stockOnHandDelta: number }> = [];
  note.lines.forEach((line) => {
    if (!line.itemId) {
      return;
    }
    const item = itemMap.get(line.itemId);
    if (!item || !item.trackInventory || !line.restock) {
      return;
    }
    stockUpdates.push({
      itemId: line.itemId,
      stockOnHandDelta: line.baseQuantity,
    });
  });

  if (stockUpdates.length > 0) {
    await applyItemStockDeltas(stockUpdates);
  }

  const amountCredited = invoice.amountCredited + note.total;
  const balance = Math.max(invoice.total - invoice.amountPaid - amountCredited, 0);
  let status = invoice.status;
  if (balance <= 0) {
    status = "paid";
  } else if (amountCredited > 0 || invoice.amountPaid > 0) {
    status = "partially_paid";
  }

  await updateSalesInvoice(invoice.id, {
    amountCredited,
    balance,
    status,
  });

  if (invoice.openItemId) {
    await updateOpenItemBalance(invoice.openItemId, balance);
  }

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "credit_note.issue",
    entity: "sales_credit_note",
    entityId: note.id,
    metadata: { creditNumber: note.creditNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId });
}
