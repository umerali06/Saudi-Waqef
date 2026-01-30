import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyRole } from "@/lib/access";
import { getPurchaseBillById, updatePurchaseBill } from "@/lib/data/purchase-bills";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createOpenItem } from "@/lib/data/open-items";
import { listItems, applyItemStockDeltas } from "@/lib/data/items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ billId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billId } = await context.params;
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (bill.status !== "draft") {
    return NextResponse.json({ error: "Bill is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, bill.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getCompanyConfig(bill.companyId);
  const threshold = typeof config.billApprovalThreshold === "number"
    ? config.billApprovalThreshold
    : 0;
  if (threshold > 0 && bill.total >= threshold) {
    const allowed = hasRequiredRole(membership.role, ["owner", "admin", "accountant"]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Approval requires owner or admin" },
        { status: 403 }
      );
    }
  }

  const lockedPeriod = await findFiledVatPeriod(bill.companyId, bill.billDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const [defaults, accounts, items] = await Promise.all([
    getCompanyDefaults(bill.companyId),
    listChartAccounts(bill.companyId),
    listItems(bill.companyId),
  ]);

  const accountIds = new Set(accounts.map((account) => account.id));
  const payableId = defaults.payableAccountId;
  const purchasesAccountId = defaults.purchasesAccountId;
  const vatInputAccountId = defaults.vatInputAccountId;
  const discountAccountId = defaults.discountAccountId;

  if (!payableId || !accountIds.has(payableId)) {
    return NextResponse.json({ error: "Missing payable account" }, { status: 400 });
  }
  if (bill.taxTotal > 0 && (!vatInputAccountId || !accountIds.has(vatInputAccountId))) {
    return NextResponse.json({ error: "Missing VAT input account" }, { status: 400 });
  }
  if (bill.discountTotal > 0 && (!discountAccountId || !accountIds.has(discountAccountId))) {
    return NextResponse.json({ error: "Missing discount account" }, { status: 400 });
  }

  const useDiscountAccount = Boolean(discountAccountId && bill.discountTotal > 0);
  const expenseTotals = new Map<string, number>();

  for (const line of bill.lines) {
    const accountId = line.expenseAccountId ?? purchasesAccountId ?? null;
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
      debit: amount,
      credit: 0,
    });
  });

  if (useDiscountAccount && discountAccountId) {
    journalLines.push({
      accountId: discountAccountId,
      debit: 0,
      credit: bill.discountTotal,
    });
  }

  if (bill.taxTotal > 0 && vatInputAccountId) {
    journalLines.push({
      accountId: vatInputAccountId,
      debit: bill.taxTotal,
      credit: 0,
    });
  }

  journalLines.push({
    accountId: payableId,
    debit: 0,
    credit: bill.total,
  });

  const journalEntryId = await createJournalEntry({
    companyId: bill.companyId,
    sourceType: "purchase_bill",
    sourceId: bill.id,
    date: bill.billDate,
    memo: `Bill ${bill.billNumber}`,
    lines: journalLines,
  });

  const openItemId = await createOpenItem({
    companyId: bill.companyId,
    partyType: "vendor",
    partyId: bill.vendorId,
    docType: "bill",
    docNumber: bill.billNumber,
    issueDate: bill.billDate,
    dueDate: bill.dueDate,
    amount: bill.total,
    balance: bill.balance,
    currency: bill.currency,
  });

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const stockUpdates: Array<{ itemId: string; stockOnHandDelta: number }> = [];
  bill.lines.forEach((line) => {
    if (!line.itemId) {
      return;
    }
    const item = itemMap.get(line.itemId);
    if (!item || !item.trackInventory) {
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

  await updatePurchaseBill(billId, {
    status: "approved",
    approvedAt: new Date().toISOString(),
    journalEntryId,
    openItemId,
  });

  await recordAuditEvent({
    companyId: bill.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.approve",
    entity: "purchase_bill",
    entityId: bill.id,
    metadata: { billNumber: bill.billNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId, openItemId });
}

