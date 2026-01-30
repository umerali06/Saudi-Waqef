import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getPurchaseBillById, updatePurchaseBill } from "@/lib/data/purchase-bills";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { deleteOpenItem } from "@/lib/data/open-items";
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

  if (!["draft", "approved"].includes(bill.status)) {
    return NextResponse.json({ error: "Bill cannot be canceled" }, { status: 400 });
  }

  if (bill.amountPaid > 0 || bill.amountCredited > 0) {
    return NextResponse.json({ error: "Bill has allocations" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, bill.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(bill.companyId, bill.billDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  if (bill.status === "approved") {
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
      return NextResponse.json(
        { error: "Missing payable account" },
        { status: 400 }
      );
    }
    if (
      bill.taxTotal > 0 &&
      (!vatInputAccountId || !accountIds.has(vatInputAccountId))
    ) {
      return NextResponse.json(
        { error: "Missing VAT input account" },
        { status: 400 }
      );
    }
    if (
      bill.discountTotal > 0 &&
      (!discountAccountId || !accountIds.has(discountAccountId))
    ) {
      return NextResponse.json(
        { error: "Missing discount account" },
        { status: 400 }
      );
    }

    const useDiscountAccount = Boolean(discountAccountId && bill.discountTotal > 0);
    const expenseTotals = new Map<string, number>();
    bill.lines.forEach((line) => {
      const accountId = line.expenseAccountId ?? purchasesAccountId ?? null;
      if (!accountId || !accountIds.has(accountId)) {
        return;
      }
      const amount = useDiscountAccount
        ? line.netAmount + line.discountAmount
        : line.netAmount;
      const current = expenseTotals.get(accountId) ?? 0;
      expenseTotals.set(accountId, current + amount);
    });

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
        debit: bill.discountTotal,
        credit: 0,
      });
    }

    if (bill.taxTotal > 0 && vatInputAccountId) {
      journalLines.push({
        accountId: vatInputAccountId,
        debit: 0,
        credit: bill.taxTotal,
      });
    }

    journalLines.push({
      accountId: payableId,
      debit: bill.total,
      credit: 0,
    });

    await createJournalEntry({
      companyId: bill.companyId,
      sourceType: "purchase_bill_cancel",
      sourceId: bill.id,
      date: bill.billDate,
      memo: `Cancel bill ${bill.billNumber}`,
      lines: journalLines,
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
        stockOnHandDelta: -line.baseQuantity,
      });
    });

    if (stockUpdates.length > 0) {
      await applyItemStockDeltas(stockUpdates);
    }

    if (bill.openItemId) {
      await deleteOpenItem(bill.openItemId);
    }
  }

  await updatePurchaseBill(billId, {
    status: "canceled",
    balance: 0,
  });

  await recordAuditEvent({
    companyId: bill.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.cancel",
    entity: "purchase_bill",
    entityId: bill.id,
    metadata: { billNumber: bill.billNumber },
  });

  return NextResponse.json({ ok: true });
}
