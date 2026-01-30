import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getVendorCreditNoteById,
  updateVendorCreditNote,
} from "@/lib/data/vendor-credit-notes";
import { getPurchaseBillById, updatePurchaseBill } from "@/lib/data/purchase-bills";
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
  const note = await getVendorCreditNoteById(creditNoteId);
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

  const [bill, defaults, accounts, items] = await Promise.all([
    getPurchaseBillById(note.billId),
    getCompanyDefaults(note.companyId),
    listChartAccounts(note.companyId),
    listItems(note.companyId),
  ]);

  if (!bill) {
    return NextResponse.json({ error: "Invalid bill" }, { status: 400 });
  }

  if (bill.status === "canceled") {
    return NextResponse.json({ error: "Bill is canceled" }, { status: 400 });
  }

  if (note.total > bill.balance) {
    return NextResponse.json({ error: "Credit exceeds balance" }, { status: 400 });
  }

  const accountIds = new Set(accounts.map((account) => account.id));
  const payableId = defaults.payableAccountId;
  const purchasesAccountId = defaults.purchasesAccountId;
  const vatInputAccountId = defaults.vatInputAccountId;
  const discountAccountId = defaults.discountAccountId;

  if (!payableId || !accountIds.has(payableId)) {
    return NextResponse.json({ error: "Missing payable account" }, { status: 400 });
  }
  if (note.taxTotal > 0 && (!vatInputAccountId || !accountIds.has(vatInputAccountId))) {
    return NextResponse.json({ error: "Missing VAT input account" }, { status: 400 });
  }
  if (note.discountTotal > 0 && (!discountAccountId || !accountIds.has(discountAccountId))) {
    return NextResponse.json({ error: "Missing discount account" }, { status: 400 });
  }

  const useDiscountAccount = Boolean(discountAccountId && note.discountTotal > 0);
  const expenseTotals = new Map<string, number>();

  const itemMap = new Map(items.map((item) => [item.id, item]));
  for (const line of note.lines) {
    if (!line.itemId) {
      return NextResponse.json({ error: "Missing purchases account" }, { status: 400 });
    }
    const accountId =
      itemMap.get(line.itemId)?.expenseAccountId ?? purchasesAccountId ?? null;
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
      debit: note.discountTotal,
      credit: 0,
    });
  }
  if (note.taxTotal > 0 && vatInputAccountId) {
    journalLines.push({
      accountId: vatInputAccountId,
      debit: 0,
      credit: note.taxTotal,
    });
  }

  journalLines.push({
    accountId: payableId,
    debit: note.total,
    credit: 0,
  });

  const journalEntryId = await createJournalEntry({
    companyId: note.companyId,
    sourceType: "vendor_credit_note",
    sourceId: note.id,
    date: note.issueDate,
    memo: `Vendor credit note ${note.creditNumber}`,
    lines: journalLines,
  });

  await updateVendorCreditNote(creditNoteId, { journalEntryId, status: "issued" });

  const stockUpdates: Array<{ itemId: string; stockOnHandDelta: number }> = [];
  note.lines.forEach((line) => {
    if (!line.itemId || !line.returnToVendor) {
      return;
    }
    const item = itemMap.get(line.itemId);
    if (!item || !item.trackInventory) {
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

  const amountCredited = bill.amountCredited + note.total;
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
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor_credit_note.issue",
    entity: "vendor_credit_note",
    entityId: note.id,
    metadata: { creditNumber: note.creditNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId });
}
