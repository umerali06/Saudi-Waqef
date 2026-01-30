import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { deleteOpenItem } from "@/lib/data/open-items";
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

  if (!["draft", "approved"].includes(invoice.status)) {
    return NextResponse.json({ error: "Invoice cannot be canceled" }, { status: 400 });
  }

  if (invoice.amountPaid > 0 || invoice.amountCredited > 0) {
    return NextResponse.json({ error: "Invoice has allocations" }, { status: 400 });
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

  const items = await listItems(invoice.companyId);
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const stockUpdates: Array<{ itemId: string; stockOnHandDelta: number }> = [];

  invoice.lines.forEach((line) => {
    if (!line.itemId) {
      return;
    }
    const item = itemMap.get(line.itemId);
    if (!item || !item.trackInventory) {
      return;
    }
    if (invoice.status === "draft") {
      stockUpdates.push({
        itemId: line.itemId,
        stockReservedDelta: -line.baseQuantity,
      });
    } else {
      stockUpdates.push({
        itemId: line.itemId,
        stockOnHandDelta: line.baseQuantity,
      });
    }
  });

  if (stockUpdates.length > 0) {
    await applyItemStockDeltas(stockUpdates);
  }

  if (invoice.status === "approved") {
    const [defaults, accounts] = await Promise.all([
      getCompanyDefaults(invoice.companyId),
      listChartAccounts(invoice.companyId),
    ]);
    const accountIds = new Set(accounts.map((account) => account.id));
    const receivableId = defaults.receivableAccountId;
    const salesAccountId = defaults.salesAccountId;
    const vatOutputAccountId = defaults.vatOutputAccountId;
    const discountAccountId = defaults.discountAccountId;

    if (!receivableId || !accountIds.has(receivableId)) {
      return NextResponse.json(
        { error: "Missing receivable account" },
        { status: 400 }
      );
    }
    if (!salesAccountId || !accountIds.has(salesAccountId)) {
      return NextResponse.json({ error: "Missing sales account" }, { status: 400 });
    }

    const journalLines = [];
    const grossSales =
      discountAccountId && invoice.discountTotal > 0
        ? invoice.subtotal + invoice.discountTotal
        : invoice.subtotal;

    journalLines.push({
      accountId: receivableId,
      debit: 0,
      credit: invoice.total,
    });
    journalLines.push({
      accountId: salesAccountId,
      debit: grossSales,
      credit: 0,
    });
    if (discountAccountId && invoice.discountTotal > 0) {
      journalLines.push({
        accountId: discountAccountId,
        debit: 0,
        credit: invoice.discountTotal,
      });
    }
    if (invoice.taxTotal > 0 && vatOutputAccountId) {
      journalLines.push({
        accountId: vatOutputAccountId,
        debit: invoice.taxTotal,
        credit: 0,
      });
    }

    await createJournalEntry({
      companyId: invoice.companyId,
      sourceType: "sales_invoice_cancel",
      sourceId: invoice.id,
      date: invoice.invoiceDate,
      memo: `Cancel invoice ${invoice.invoiceNumber}`,
      lines: journalLines,
    });

    if (invoice.openItemId) {
      await deleteOpenItem(invoice.openItemId);
    }
  }

  await updateSalesInvoice(invoiceId, {
    status: "canceled",
    balance: 0,
  });

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.cancel",
    entity: "sales_invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });

  return NextResponse.json({ ok: true });
}
