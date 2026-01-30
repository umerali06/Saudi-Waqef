import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createOpenItem } from "@/lib/data/open-items";
import { listItems, applyItemStockDeltas } from "@/lib/data/items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status !== "draft") {
    return NextResponse.json({ error: "Invoice is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, invoice.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(
    invoice.companyId,
    invoice.invoiceDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const [defaults, accounts, items] = await Promise.all([
    getCompanyDefaults(invoice.companyId),
    listChartAccounts(invoice.companyId),
    listItems(invoice.companyId),
  ]);

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
  if (invoice.taxTotal > 0 && (!vatOutputAccountId || !accountIds.has(vatOutputAccountId))) {
    return NextResponse.json({ error: "Missing VAT output account" }, { status: 400 });
  }

  const journalLines = [];
  const grossSales =
    discountAccountId && invoice.discountTotal > 0
      ? invoice.subtotal + invoice.discountTotal
      : invoice.subtotal;

  journalLines.push({
    accountId: receivableId,
    debit: invoice.total,
    credit: 0,
  });

  journalLines.push({
    accountId: salesAccountId,
    debit: 0,
    credit: grossSales,
  });

  if (discountAccountId && invoice.discountTotal > 0) {
    if (!accountIds.has(discountAccountId)) {
      return NextResponse.json(
        { error: "Missing discount account" },
        { status: 400 }
      );
    }
    journalLines.push({
      accountId: discountAccountId,
      debit: invoice.discountTotal,
      credit: 0,
    });
  }

  if (invoice.taxTotal > 0 && vatOutputAccountId) {
    journalLines.push({
      accountId: vatOutputAccountId,
      debit: 0,
      credit: invoice.taxTotal,
    });
  }

  const journalEntryId = await createJournalEntry({
    companyId: invoice.companyId,
    sourceType: "sales_invoice",
    sourceId: invoice.id,
    date: invoice.invoiceDate,
    memo: `Invoice ${invoice.invoiceNumber}`,
    lines: journalLines,
  });

  const openItemId = await createOpenItem({
    companyId: invoice.companyId,
    partyType: "customer",
    partyId: invoice.customerId,
    docType: "invoice",
    docNumber: invoice.invoiceNumber,
    issueDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    amount: invoice.total,
    balance: invoice.balance,
    currency: invoice.currency,
  });

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const stockUpdates: Array<{
    itemId: string;
    stockReservedDelta?: number;
    stockOnHandDelta?: number;
  }> = [];
  invoice.lines.forEach((line) => {
    if (!line.itemId) {
      return;
    }
    const item = itemMap.get(line.itemId);
    if (!item || !item.trackInventory) {
      return;
    }
    stockUpdates.push({
      itemId: line.itemId,
      stockReservedDelta: -line.baseQuantity,
      stockOnHandDelta: -line.baseQuantity,
    });
  });

  if (stockUpdates.length > 0) {
    await applyItemStockDeltas(stockUpdates);
  }

  await updateSalesInvoice(invoiceId, {
    status: "approved",
    approvedAt: new Date().toISOString(),
    journalEntryId,
    openItemId,
  });

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.approve",
    entity: "sales_invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId, openItemId });
}
