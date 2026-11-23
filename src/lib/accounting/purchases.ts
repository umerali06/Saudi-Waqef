import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { PostingError } from "@/lib/accounting/errors";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { applyItemStockDeltas, listItems } from "@/lib/data/items";
import { createJournalEntry, getJournalEntry } from "@/lib/data/journal-entries";
import { createOpenItem, deleteOpenItem, updateOpenItemBalance } from "@/lib/data/open-items";
import {
  getPurchaseBillById,
  updatePurchaseBill,
  type PurchaseBill,
} from "@/lib/data/purchase-bills";
import {
  createVendorCreditNote,
  getVendorCreditNoteById,
  updateVendorCreditNote,
  type VendorCreditNoteLine,
} from "@/lib/data/vendor-credit-notes";
import { roundLineAmounts, roundMoney, sumLineAmounts } from "@/lib/utils/invoice";
import { reverseLines } from "@/lib/utils/journal";
import { buildPurchasePosting } from "@/lib/utils/posting";
import {
  allocateCreditNote,
  outstandingBalance,
  settlementStatus,
} from "@/lib/utils/settlement";

type PurchaseLine = {
  itemId?: string | null;
  expenseAccountId?: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  discountAmount: number;
  baseQuantity: number;
};

/** Accounts and items needed to post a company's purchase documents. */
async function loadPurchaseContext(companyId: string) {
  const [defaults, accounts, items] = await Promise.all([
    getCompanyDefaults(companyId),
    listChartAccounts(companyId),
    listItems(companyId),
  ]);
  const accountIds = new Set(accounts.map((account) => account.id));
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const post = (lines: PurchaseLine[]) => {
    const totals = sumLineAmounts(lines);
    const { payableAccountId, purchasesAccountId, vatInputAccountId, discountAccountId } =
      defaults;
    if (!payableAccountId || !accountIds.has(payableAccountId)) {
      throw new PostingError("Missing payable account");
    }
    if (totals.taxTotal > 0 && (!vatInputAccountId || !accountIds.has(vatInputAccountId))) {
      throw new PostingError("Missing VAT input account");
    }
    if (totals.discountTotal > 0 && discountAccountId && !accountIds.has(discountAccountId)) {
      throw new PostingError("Missing discount account");
    }
    const journalLines = buildPurchasePosting(
      {
        ...totals,
        lines: lines.map((line) => {
          const accountId =
            line.expenseAccountId ??
            (line.itemId ? itemMap.get(line.itemId)?.expenseAccountId : null) ??
            purchasesAccountId;
          if (!accountId || !accountIds.has(accountId)) {
            throw new PostingError("Missing purchases account");
          }
          return {
            accountId,
            netAmount: line.netAmount,
            discountAmount: line.discountAmount,
          };
        }),
      },
      {
        payableId: payableAccountId,
        vatInputId: totals.taxTotal > 0 ? vatInputAccountId : null,
        discountId: discountAccountId,
      }
    );
    return { totals, journalLines };
  };

  const trackedLines = <T extends { itemId?: string | null }>(lines: T[]) =>
    lines.filter((line): line is T & { itemId: string } =>
      Boolean(line.itemId && itemMap.get(line.itemId)?.trackInventory)
    );

  return { post, trackedLines };
}

export async function approvePurchaseBill(bill: PurchaseBill) {
  const context = await loadPurchaseContext(bill.companyId);
  return db.runTransaction(async (tx) => {
    const current = await getPurchaseBillById(bill.id, tx);
    if (!current || current.status !== "draft") {
      throw new PostingError("Bill is locked");
    }
    if (current.billDate !== bill.billDate || current.total !== bill.total) {
      throw new PostingError("Bill changed, try again", 409);
    }

    const lines = roundLineAmounts(current.lines);
    const { totals, journalLines } = context.post(lines);

    const journalEntryId = await createJournalEntry(
      {
        companyId: current.companyId,
        sourceType: "purchase_bill",
        sourceId: current.id,
        date: current.billDate,
        memo: `Bill ${current.billNumber}`,
        lines: journalLines,
      },
      tx
    );
    const openItemId = await createOpenItem(
      {
        companyId: current.companyId,
        partyType: "vendor",
        partyId: current.vendorId,
        docType: "bill",
        docNumber: current.billNumber,
        sourceId: current.id,
        issueDate: current.billDate,
        dueDate: current.dueDate,
        amount: totals.total,
        balance: totals.total,
        currency: current.currency,
      },
      tx
    );
    await applyItemStockDeltas(
      context.trackedLines(lines).map((line) => ({
        itemId: line.itemId,
        stockOnHandDelta: line.baseQuantity,
      })),
      tx
    );
    await updatePurchaseBill(
      current.id,
      {
        ...totals,
        lines,
        balance: totals.total,
        status: "approved",
        approvedAt: new Date().toISOString(),
        journalEntryId,
        openItemId,
      },
      tx
    );
    return { journalEntryId, openItemId };
  });
}

export async function cancelPurchaseBill(billId: string) {
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    throw new PostingError("Not found", 404);
  }
  const context = await loadPurchaseContext(bill.companyId);
  await db.runTransaction(async (tx) => {
    const current = await getPurchaseBillById(billId, tx);
    if (!current || !["draft", "approved"].includes(current.status)) {
      throw new PostingError("Bill cannot be canceled");
    }
    if (
      current.amountPaid > 0 ||
      current.amountCredited > 0 ||
      current.creditNotesTotal > 0
    ) {
      throw new PostingError("Bill has allocations");
    }

    let cancelJournalEntryId: string | null = null;
    if (current.status === "approved") {
      const original = current.journalEntryId
        ? await getJournalEntry(current.journalEntryId, tx)
        : null;
      if (!original) {
        throw new PostingError("Original journal entry not found");
      }
      cancelJournalEntryId = await createJournalEntry(
        {
          companyId: current.companyId,
          sourceType: "purchase_bill_cancel",
          sourceId: current.id,
          date: current.billDate,
          memo: `Cancel bill ${current.billNumber}`,
          lines: reverseLines(original.lines),
          reversalOf: original.id,
        },
        tx
      );
      await applyItemStockDeltas(
        context.trackedLines(current.lines).map((line) => ({
          itemId: line.itemId,
          stockOnHandDelta: -line.baseQuantity,
        })),
        tx
      );
      if (current.openItemId) {
        await deleteOpenItem(current.openItemId, tx);
      }
    }
    await updatePurchaseBill(
      current.id,
      { status: "canceled", balance: 0, cancelJournalEntryId },
      tx
    );
  });
}

/**
 * Issues a vendor credit note: an existing draft, or a new note when `create`
 * is given. The part above the bill's open balance was already paid, so it
 * becomes a vendor credit that can be applied to other bills.
 */
export async function issueVendorCreditNote(
  params:
    | { noteId: string; issueDate: string; companyId: string; create?: undefined }
    | {
        create: {
          billId: string;
          issueDate: string;
          currency?: string | null;
          notes?: string | null;
          reason?: string | null;
          lines: VendorCreditNoteLine[];
        };
        companyId: string;
      }
) {
  const context = await loadPurchaseContext(params.companyId);
  const newId = uuidv4();
  return db.runTransaction(async (tx) => {
    const draft = params.create ? null : await getVendorCreditNoteById(params.noteId, tx);
    if (!params.create) {
      if (!draft || draft.status !== "draft") {
        throw new PostingError("Credit note is locked");
      }
      if (draft.issueDate !== params.issueDate) {
        throw new PostingError("Credit note changed, try again", 409);
      }
    }
    const source = params.create ?? draft!;
    const bill = await getPurchaseBillById(source.billId, tx);
    if (!bill || bill.companyId !== params.companyId) {
      throw new PostingError("Invalid bill");
    }
    if (bill.status === "canceled") {
      throw new PostingError("Bill is canceled");
    }
    if (bill.status === "draft") {
      throw new PostingError("Bill is not approved");
    }

    const lines = roundLineAmounts(source.lines);
    const { totals, journalLines } = context.post(lines);
    const allocation = allocateCreditNote({
      noteTotal: totals.total,
      balance: outstandingBalance(bill),
      documentTotal: bill.total,
      creditNotesTotal: bill.creditNotesTotal,
    });
    if (!allocation) {
      throw new PostingError("Credit exceeds balance");
    }

    const noteId = draft?.id ?? newId;
    const journalEntryId = uuidv4();
    const creditOpenItemId = allocation.unapplied > 0 ? uuidv4() : null;
    const issued = {
      ...totals,
      lines,
      status: "issued" as const,
      journalEntryId,
      unappliedAmount: allocation.unapplied,
      creditOpenItemId,
    };
    let creditNumber = draft?.creditNumber ?? "";
    if (params.create) {
      const created = await createVendorCreditNote(
        {
          ...issued,
          id: noteId,
          companyId: params.companyId,
          billId: bill.id,
          billNumber: bill.billNumber,
          vendorId: bill.vendorId,
          vendorName: bill.vendorName,
          issueDate: source.issueDate,
          currency: source.currency ?? bill.currency,
          notes: source.notes ?? null,
          reason: source.reason ?? null,
        },
        tx
      );
      creditNumber = created.creditNumber;
    } else {
      await updateVendorCreditNote(noteId, issued, tx);
    }

    await createJournalEntry(
      {
        id: journalEntryId,
        companyId: params.companyId,
        sourceType: "vendor_credit_note",
        sourceId: noteId,
        date: source.issueDate,
        memo: `Vendor credit note ${creditNumber}`,
        lines: reverseLines(journalLines),
      },
      tx
    );
    if (creditOpenItemId) {
      await createOpenItem(
        {
          id: creditOpenItemId,
          companyId: params.companyId,
          partyType: "vendor",
          partyId: bill.vendorId,
          docType: "vendor_credit_note_credit",
          docNumber: creditNumber,
          sourceId: noteId,
          issueDate: source.issueDate,
          dueDate: source.issueDate,
          amount: -allocation.unapplied,
          balance: -allocation.unapplied,
          currency: bill.currency,
        },
        tx
      );
    }
    await applyItemStockDeltas(
      context
        .trackedLines(lines)
        .filter((line) => line.returnToVendor)
        .map((line) => ({ itemId: line.itemId, stockOnHandDelta: -line.baseQuantity })),
      tx
    );

    const amounts = {
      ...bill,
      amountCredited: roundMoney(bill.amountCredited + allocation.applied),
    };
    const balance = outstandingBalance(amounts);
    await updatePurchaseBill(
      bill.id,
      {
        amountCredited: amounts.amountCredited,
        creditNotesTotal: roundMoney(bill.creditNotesTotal + totals.total),
        balance,
        status: settlementStatus(amounts, bill.status),
      },
      tx
    );
    if (bill.openItemId) {
      await updateOpenItemBalance(bill.openItemId, balance, tx);
    }
    return { id: noteId, creditNumber, journalEntryId, total: totals.total };
  });
}
