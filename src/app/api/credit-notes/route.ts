import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { creditNoteSchema } from "@/lib/validators/sales";
import {
  createSalesCreditNote,
  listSalesCreditNotes,
  updateSalesCreditNote,
} from "@/lib/data/credit-notes";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { listItems } from "@/lib/data/items";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { toBaseQuantity } from "@/lib/utils/units";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { updateOpenItemBalance } from "@/lib/data/open-items";
import { applyItemStockDeltas } from "@/lib/data/items";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

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

  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const invoiceId = searchParams.get("invoiceId");
  const q = normalizeSearch(searchParams.get("q") ?? "");

  const notes = await listSalesCreditNotes(companyId);
  let filtered = notes;
  if (status && status !== "all") {
    filtered = filtered.filter((note) => note.status === status);
  }
  if (customerId) {
    filtered = filtered.filter((note) => note.customerId === customerId);
  }
  if (invoiceId) {
    filtered = filtered.filter((note) => note.invoiceId === invoiceId);
  }
  if (q) {
    filtered = filtered.filter(
      (note) =>
        normalizeSearch(note.creditNumber).includes(q) ||
        normalizeSearch(note.customerName).includes(q)
    );
  }

  filtered.sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  return NextResponse.json({
    creditNotes: filtered.map((note) => ({
      id: note.id,
      creditNumber: note.creditNumber,
      invoiceId: note.invoiceId,
      invoiceNumber: note.invoiceNumber,
      customerId: note.customerId,
      customerName: note.customerName,
      status: note.status,
      issueDate: note.issueDate,
      total: note.total,
      currency: note.currency,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = creditNoteSchema.safeParse(body);
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

  const lockedPeriod = await findFiledVatPeriod(
    parsed.data.companyId,
    parsed.data.issueDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const invoice = await getSalesInvoiceById(parsed.data.invoiceId);
  if (!invoice || invoice.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid invoice" }, { status: 400 });
  }

  if (invoice.status === "canceled") {
    return NextResponse.json({ error: "Invoice is canceled" }, { status: 400 });
  }

  const [items, taxCategories, defaults, config, accounts] = await Promise.all([
    listItems(parsed.data.companyId),
    listTaxCategories(parsed.data.companyId),
    getCompanyDefaults(parsed.data.companyId),
    getCompanyConfig(parsed.data.companyId),
    listChartAccounts(parsed.data.companyId),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));
  const accountIds = new Set(accounts.map((account) => account.id));

  const computedLines = [];
  const restockMap = new Map<string, number>();

  for (const line of parsed.data.lines) {
    const item = line.itemId ? itemMap.get(line.itemId) : null;
    if (!item) {
      return NextResponse.json({ error: "Invalid item" }, { status: 400 });
    }

    const unitOptions = [item.baseUnit, item.packUnit].filter(Boolean);
    if (!unitOptions.includes(line.unit)) {
      return NextResponse.json({ error: "Invalid unit" }, { status: 400 });
    }

    const taxCategoryId =
      line.taxCategoryId ??
      item.taxCategoryId ??
      defaults.defaultSalesTaxCategoryId ??
      null;
    const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
    const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;

    const amounts = calculateLineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountRate: line.discountRate ?? 0,
      taxRate,
      taxInclusive: Boolean(config.taxInclusive),
    });

    const baseQuantity = toBaseQuantity(line.quantity, line.unit, {
      baseUnit: item.baseUnit,
      packUnit: item.packUnit,
      packSize: item.packSize ?? undefined,
    });

    computedLines.push({
      id: line.id ?? crypto.randomUUID(),
      invoiceLineId: line.invoiceLineId ?? null,
      itemId: item.id,
      description: line.description || item.name,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      discountRate: line.discountRate ?? 0,
      discountAmount: amounts.discountAmount,
      taxCategoryId,
      taxRate,
      taxAmount: amounts.taxAmount,
      netAmount: amounts.netAmount,
      totalAmount: amounts.totalAmount,
      baseQuantity,
      restock: line.restock ?? item.trackInventory,
    });

    if (item.trackInventory && (line.restock ?? item.trackInventory)) {
      const current = restockMap.get(item.id) ?? 0;
      restockMap.set(item.id, current + baseQuantity);
    }
  }

  const subtotal = computedLines.reduce((sum, line) => sum + line.netAmount, 0);
  const discountTotal = computedLines.reduce(
    (sum, line) => sum + line.discountAmount,
    0
  );
  const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = computedLines.reduce((sum, line) => sum + line.totalAmount, 0);

  if (total > invoice.balance) {
    return NextResponse.json({ error: "Credit exceeds balance" }, { status: 400 });
  }

  const { id, creditNumber } = await createSalesCreditNote({
    companyId: parsed.data.companyId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    issueDate: parsed.data.issueDate,
    currency: parsed.data.currency ?? invoice.currency,
    notes: parsed.data.notes ?? null,
    reason: parsed.data.reason ?? null,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    status: parsed.data.status ?? "issued",
    lines: computedLines,
  });

  if ((parsed.data.status ?? "issued") === "draft") {
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "credit_note.create",
      entity: "sales_credit_note",
      entityId: id,
      metadata: { creditNumber, status: "draft" },
    });
    return NextResponse.json({ creditNoteId: id, creditNumber });
  }

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
  if (taxTotal > 0 && (!vatOutputAccountId || !accountIds.has(vatOutputAccountId))) {
    return NextResponse.json({ error: "Missing VAT output account" }, { status: 400 });
  }
  if (discountTotal > 0 && (!discountAccountId || !accountIds.has(discountAccountId))) {
    return NextResponse.json({ error: "Missing discount account" }, { status: 400 });
  }

  const journalLines = [];
  const grossSales =
    discountAccountId && discountTotal > 0 ? subtotal + discountTotal : subtotal;

  journalLines.push({
    accountId: receivableId,
    debit: 0,
    credit: total,
  });
  journalLines.push({
    accountId: salesAccountId,
    debit: grossSales,
    credit: 0,
  });
  if (discountAccountId && discountTotal > 0) {
    journalLines.push({
      accountId: discountAccountId,
      debit: 0,
      credit: discountTotal,
    });
  }
  if (taxTotal > 0 && vatOutputAccountId) {
    journalLines.push({
      accountId: vatOutputAccountId,
      debit: taxTotal,
      credit: 0,
    });
  }

  const journalEntryId = await createJournalEntry({
    companyId: invoice.companyId,
    sourceType: "sales_credit_note",
    sourceId: id,
    date: parsed.data.issueDate,
    memo: `Credit note ${creditNumber}`,
    lines: journalLines,
  });

  await updateSalesCreditNote(id, { journalEntryId, status: "issued" });

  if (restockMap.size > 0) {
    const updates = Array.from(restockMap.entries()).map(([itemId, qty]) => ({
      itemId,
      stockOnHandDelta: qty,
    }));
    await applyItemStockDeltas(updates);
  }

  const amountCredited = invoice.amountCredited + total;
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
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "credit_note.issue",
    entity: "sales_credit_note",
    entityId: id,
    metadata: { creditNumber, total },
  });

  return NextResponse.json({ creditNoteId: id, creditNumber });
}

