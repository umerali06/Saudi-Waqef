import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesDebitNoteById, updateSalesDebitNote } from "@/lib/data/debit-notes";
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
  params: Promise<{ debitNoteId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { debitNoteId } = await context.params;
  const note = await getSalesDebitNoteById(debitNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (note.status !== "draft") {
    return NextResponse.json({ error: "Debit note is locked" }, { status: 400 });
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
      debit: note.total,
      credit: 0,
    },
    {
      accountId: salesAccountId,
      debit: 0,
      credit: grossSales,
    },
  ];

  if (discountAccountId && note.discountTotal > 0) {
    journalLines.push({
      accountId: discountAccountId,
      debit: note.discountTotal,
      credit: 0,
    });
  }
  if (note.taxTotal > 0 && vatOutputAccountId) {
    journalLines.push({
      accountId: vatOutputAccountId,
      debit: 0,
      credit: note.taxTotal,
    });
  }

  const journalEntryId = await createJournalEntry({
    companyId: note.companyId,
    sourceType: "sales_debit_note",
    sourceId: note.id,
    date: note.issueDate,
    memo: `Debit note ${note.debitNumber}`,
    lines: journalLines,
  });

  await updateSalesDebitNote(debitNoteId, { journalEntryId, status: "issued" });

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
      stockOnHandDelta: -line.baseQuantity,
    });
  });

  if (stockUpdates.length > 0) {
    await applyItemStockDeltas(stockUpdates);
  }

  const balance = invoice.balance + note.total;
  const status = invoice.amountPaid > 0 ? "partially_paid" : "approved";

  await updateSalesInvoice(invoice.id, {
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
    action: "debit-note.issue",
    entity: "sales_debit_note",
    entityId: note.id,
    metadata: { debitNumber: note.debitNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId });
}
