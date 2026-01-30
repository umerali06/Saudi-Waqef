import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { vendorCreditNoteSchema } from "@/lib/validators/purchases";
import {
  createVendorCreditNote,
  listVendorCreditNotes,
  updateVendorCreditNote,
} from "@/lib/data/vendor-credit-notes";
import { getPurchaseBillById, updatePurchaseBill } from "@/lib/data/purchase-bills";
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
  const vendorId = searchParams.get("vendorId");
  const billId = searchParams.get("billId");
  const q = normalizeSearch(searchParams.get("q") ?? "");

  const notes = await listVendorCreditNotes(companyId);
  let filtered = notes;
  if (status && status !== "all") {
    filtered = filtered.filter((note) => note.status === status);
  }
  if (vendorId) {
    filtered = filtered.filter((note) => note.vendorId === vendorId);
  }
  if (billId) {
    filtered = filtered.filter((note) => note.billId === billId);
  }
  if (q) {
    filtered = filtered.filter(
      (note) =>
        normalizeSearch(note.creditNumber).includes(q) ||
        normalizeSearch(note.vendorName).includes(q)
    );
  }

  filtered.sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  return NextResponse.json({
    creditNotes: filtered.map((note) => ({
      id: note.id,
      creditNumber: note.creditNumber,
      billId: note.billId,
      billNumber: note.billNumber,
      vendorId: note.vendorId,
      vendorName: note.vendorName,
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
  const parsed = vendorCreditNoteSchema.safeParse(body);
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

  const bill = await getPurchaseBillById(parsed.data.billId);
  if (!bill || bill.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid bill" }, { status: 400 });
  }

  if (bill.status === "canceled") {
    return NextResponse.json({ error: "Bill is canceled" }, { status: 400 });
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
  const returnMap = new Map<string, number>();

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
      defaults.defaultPurchaseTaxCategoryId ??
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

    const returnToVendor = line.returnToVendor ?? item.trackInventory;

    computedLines.push({
      id: line.id ?? crypto.randomUUID(),
      billLineId: line.billLineId ?? null,
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
      returnToVendor,
    });

    if (item.trackInventory && returnToVendor) {
      const current = returnMap.get(item.id) ?? 0;
      returnMap.set(item.id, current + baseQuantity);
    }
  }

  const subtotal = computedLines.reduce((sum, line) => sum + line.netAmount, 0);
  const discountTotal = computedLines.reduce(
    (sum, line) => sum + line.discountAmount,
    0
  );
  const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = computedLines.reduce((sum, line) => sum + line.totalAmount, 0);

  if (total > bill.balance) {
    return NextResponse.json({ error: "Credit exceeds balance" }, { status: 400 });
  }

  const { id, creditNumber } = await createVendorCreditNote({
    companyId: parsed.data.companyId,
    billId: bill.id,
    billNumber: bill.billNumber,
    vendorId: bill.vendorId,
    vendorName: bill.vendorName,
    issueDate: parsed.data.issueDate,
    currency: parsed.data.currency ?? bill.currency,
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
      action: "vendor_credit_note.create",
      entity: "vendor_credit_note",
      entityId: id,
      metadata: { creditNumber, status: "draft" },
    });
    return NextResponse.json({ creditNoteId: id, creditNumber });
  }

  const payableId = defaults.payableAccountId;
  const purchasesAccountId = defaults.purchasesAccountId;
  const vatInputAccountId = defaults.vatInputAccountId;
  const discountAccountId = defaults.discountAccountId;

  if (!payableId || !accountIds.has(payableId)) {
    return NextResponse.json({ error: "Missing payable account" }, { status: 400 });
  }
  if (taxTotal > 0 && (!vatInputAccountId || !accountIds.has(vatInputAccountId))) {
    return NextResponse.json({ error: "Missing VAT input account" }, { status: 400 });
  }
  if (discountTotal > 0 && (!discountAccountId || !accountIds.has(discountAccountId))) {
    return NextResponse.json({ error: "Missing discount account" }, { status: 400 });
  }

  const useDiscountAccount = Boolean(discountAccountId && discountTotal > 0);
  const expenseTotals = new Map<string, number>();

  for (const line of computedLines) {
    const accountId = line.itemId
      ? itemMap.get(line.itemId)?.expenseAccountId ?? purchasesAccountId ?? null
      : purchasesAccountId ?? null;
    if (!accountId || !accountIds.has(accountId)) {
      return NextResponse.json({ error: "Missing purchases account" }, { status: 400 });
    }
    const amount = useDiscountAccount
      ? line.netAmount + line.discountAmount
      : line.netAmount;
    const current = expenseTotals.get(accountId) ?? 0;
    expenseTotals.set(accountId, current + amount);
  }

  const journalLines = [];
  expenseTotals.forEach((amount, accountId) => {
    journalLines.push({
      accountId,
      debit: 0,
      credit: amount,
    });
  });

  if (useDiscountAccount && discountAccountId) {
    journalLines.push({
      accountId: discountAccountId,
      debit: discountTotal,
      credit: 0,
    });
  }

  if (taxTotal > 0 && vatInputAccountId) {
    journalLines.push({
      accountId: vatInputAccountId,
      debit: 0,
      credit: taxTotal,
    });
  }

  journalLines.push({
    accountId: payableId,
    debit: total,
    credit: 0,
  });

  const journalEntryId = await createJournalEntry({
    companyId: bill.companyId,
    sourceType: "vendor_credit_note",
    sourceId: id,
    date: parsed.data.issueDate,
    memo: `Vendor credit note ${creditNumber}`,
    lines: journalLines,
  });

  await updateVendorCreditNote(id, { journalEntryId, status: "issued" });

  if (returnMap.size > 0) {
    const updates = Array.from(returnMap.entries()).map(([itemId, qty]) => ({
      itemId,
      stockOnHandDelta: -qty,
    }));
    await applyItemStockDeltas(updates);
  }

  const amountCredited = bill.amountCredited + total;
  const balance = Math.max(bill.total - bill.amountPaid - amountCredited, 0);
  let status = bill.status;
  if (balance <= 0) {
    status = "paid";
  } else if (amountCredited > 0 || bill.amountPaid > 0) {
    status = "partially_paid";
  }

  await updatePurchaseBill(bill.id, {
    amountCredited,
    balance,
    status,
  });

  if (bill.openItemId) {
    await updateOpenItemBalance(bill.openItemId, balance);
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor_credit_note.issue",
    entity: "vendor_credit_note",
    entityId: id,
    metadata: { creditNumber, total },
  });

  return NextResponse.json({ creditNoteId: id, creditNumber });
}

