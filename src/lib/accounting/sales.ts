import { db } from "@/lib/firebase/admin";
import { PostingError } from "@/lib/accounting/errors";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import {
  createSalesCreditNote,
  getSalesCreditNoteById,
  updateSalesCreditNote,
  type CreditNoteLine,
} from "@/lib/data/credit-notes";
import {
  createSalesDebitNote,
  getSalesDebitNoteById,
  updateSalesDebitNote,
  type DebitNoteLine,
} from "@/lib/data/debit-notes";
import { applyItemStockDeltas, listItems } from "@/lib/data/items";
import { createJournalEntry, getJournalEntry } from "@/lib/data/journal-entries";
import { createOpenItem, deleteOpenItem, updateOpenItemBalance } from "@/lib/data/open-items";
import {
  getSalesInvoiceById,
  updateSalesInvoice,
  type SalesInvoice,
} from "@/lib/data/sales-invoices";
import { roundLineAmounts, roundMoney, sumLineAmounts } from "@/lib/utils/invoice";
import { reverseLines } from "@/lib/utils/journal";
import { buildSalesPosting } from "@/lib/utils/posting";
import {
  allocateCreditNote,
  outstandingBalance,
  settlementStatus,
} from "@/lib/utils/settlement";
import { v4 as uuidv4 } from "uuid";

type SalesLine = {
  itemId?: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  discountAmount: number;
  baseQuantity: number;
};

/** Accounts and items needed to post a company's sales documents. */
export async function loadSalesContext(companyId: string) {
  const [defaults, accounts, items] = await Promise.all([
    getCompanyDefaults(companyId),
    listChartAccounts(companyId),
    listItems(companyId),
  ]);
  const accountIds = new Set(accounts.map((account) => account.id));
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const post = (lines: SalesLine[]) => {
    const totals = sumLineAmounts(lines);
    const { receivableAccountId, salesAccountId, vatOutputAccountId, discountAccountId } =
      defaults;
    if (!receivableAccountId || !accountIds.has(receivableAccountId)) {
      throw new PostingError("Missing receivable account");
    }
    if (totals.taxTotal > 0 && (!vatOutputAccountId || !accountIds.has(vatOutputAccountId))) {
      throw new PostingError("Missing VAT output account");
    }
    if (totals.discountTotal > 0 && discountAccountId && !accountIds.has(discountAccountId)) {
      throw new PostingError("Missing discount account");
    }
    const journalLines = buildSalesPosting(
      {
        ...totals,
        lines: lines.map((line) => {
          const itemAccountId = line.itemId
            ? itemMap.get(line.itemId)?.incomeAccountId
            : null;
          const accountId =
            itemAccountId && accountIds.has(itemAccountId) ? itemAccountId : salesAccountId;
          if (!accountId || !accountIds.has(accountId)) {
            throw new PostingError("Missing sales account");
          }
          return {
            accountId,
            netAmount: line.netAmount,
            discountAmount: line.discountAmount,
          };
        }),
      },
      {
        receivableId: receivableAccountId,
        vatOutputId: totals.taxTotal > 0 ? vatOutputAccountId : null,
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

export type SalesContext = Awaited<ReturnType<typeof loadSalesContext>>;

export async function approveSalesInvoice(invoice: SalesInvoice) {
  const context = await loadSalesContext(invoice.companyId);
  return db.runTransaction(async (tx) => {
    const current = await getSalesInvoiceById(invoice.id, tx);
    if (!current || current.status !== "draft") {
      throw new PostingError("Invoice is locked");
    }
    if (current.invoiceDate !== invoice.invoiceDate) {
      throw new PostingError("Invoice changed, try again", 409);
    }

    const lines = roundLineAmounts(current.lines);
    const { totals, journalLines } = context.post(lines);

    const journalEntryId = await createJournalEntry(
      {
        companyId: current.companyId,
        sourceType: "sales_invoice",
        sourceId: current.id,
        date: current.invoiceDate,
        memo: `Invoice ${current.invoiceNumber}`,
        lines: journalLines,
      },
      tx
    );
    const openItemId = await createOpenItem(
      {
        companyId: current.companyId,
        partyType: "customer",
        partyId: current.customerId,
        docType: "invoice",
        docNumber: current.invoiceNumber,
        sourceId: current.id,
        issueDate: current.invoiceDate,
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
        stockReservedDelta: -line.baseQuantity,
        stockOnHandDelta: -line.baseQuantity,
      })),
      tx
    );
    await updateSalesInvoice(
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

export async function cancelSalesInvoice(invoiceId: string) {
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    throw new PostingError("Not found", 404);
  }
  const context = await loadSalesContext(invoice.companyId);
  await db.runTransaction(async (tx) => {
    const current = await getSalesInvoiceById(invoiceId, tx);
    if (!current || !["draft", "approved"].includes(current.status)) {
      throw new PostingError("Invoice cannot be canceled");
    }
    if (
      current.amountPaid > 0 ||
      current.amountCredited > 0 ||
      current.creditNotesTotal > 0 ||
      current.amountDebited > 0
    ) {
      throw new PostingError("Invoice has allocations");
    }

    const isApproved = current.status === "approved";
    const original =
      isApproved && current.journalEntryId
        ? await getJournalEntry(current.journalEntryId, tx)
        : null;
    if (isApproved && !original) {
      throw new PostingError("Original journal entry not found");
    }

    let cancelJournalEntryId: string | null = null;
    if (original) {
      cancelJournalEntryId = await createJournalEntry(
        {
          companyId: current.companyId,
          sourceType: "sales_invoice_cancel",
          sourceId: current.id,
          date: current.invoiceDate,
          memo: `Cancel invoice ${current.invoiceNumber}`,
          lines: reverseLines(original.lines),
          reversalOf: original.id,
        },
        tx
      );
      if (current.openItemId) {
        await deleteOpenItem(current.openItemId, tx);
      }
    }
    await applyItemStockDeltas(
      context.trackedLines(current.lines).map((line) =>
        isApproved
          ? { itemId: line.itemId, stockOnHandDelta: line.baseQuantity }
          : { itemId: line.itemId, stockReservedDelta: -line.baseQuantity }
      ),
      tx
    );
    await updateSalesInvoice(
      current.id,
      { status: "canceled", balance: 0, cancelJournalEntryId },
      tx
    );
  });
}

/** Loads the invoice a note belongs to and refuses states a note cannot change. */
function assertNoteAllowed(invoice: SalesInvoice | null, companyId: string) {
  if (!invoice || invoice.companyId !== companyId) {
    throw new PostingError("Invalid invoice");
  }
  if (invoice.status === "canceled") {
    throw new PostingError("Invoice is canceled");
  }
  if (invoice.status === "draft") {
    throw new PostingError("Invoice is not approved");
  }
  return invoice;
}

type NoteFields = {
  companyId: string;
  invoiceId: string;
  issueDate: string;
  currency?: string | null;
  notes?: string | null;
  reason?: string | null;
};

/**
 * Issues a credit note: an existing draft, or a new note when `create` is given.
 * The part of the note above the invoice's open balance was already paid, so it
 * becomes a customer credit that can be refunded or applied to other invoices.
 */
export async function issueSalesCreditNote(
  params:
    | { noteId: string; issueDate: string; companyId: string; create?: undefined }
    | { create: NoteFields & { lines: CreditNoteLine[] }; companyId: string }
) {
  const context = await loadSalesContext(params.companyId);
  const newId = uuidv4();
  return db.runTransaction(async (tx) => {
    const draft = params.create ? null : await getSalesCreditNoteById(params.noteId, tx);
    if (!params.create) {
      if (!draft || draft.status !== "draft") {
        throw new PostingError("Credit note is locked");
      }
      if (draft.issueDate !== params.issueDate) {
        throw new PostingError("Credit note changed, try again", 409);
      }
    }
    const source = params.create ?? draft!;
    const invoice = assertNoteAllowed(
      await getSalesInvoiceById(source.invoiceId, tx),
      params.companyId
    );

    const lines = roundLineAmounts(source.lines);
    const { totals, journalLines } = context.post(lines);
    const allocation = allocateCreditNote({
      noteTotal: totals.total,
      balance: outstandingBalance(invoice),
      documentTotal: invoice.total,
      amountDebited: invoice.amountDebited,
      creditNotesTotal: invoice.creditNotesTotal,
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
      const created = await createSalesCreditNote(
        {
          ...issued,
          id: noteId,
          companyId: params.companyId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          issueDate: source.issueDate,
          currency: source.currency ?? invoice.currency,
          notes: source.notes ?? null,
          reason: source.reason ?? null,
        },
        tx
      );
      creditNumber = created.creditNumber;
    } else {
      await updateSalesCreditNote(noteId, issued, tx);
    }

    await createJournalEntry(
      {
        id: journalEntryId,
        companyId: params.companyId,
        sourceType: "sales_credit_note",
        sourceId: noteId,
        date: source.issueDate,
        memo: `Credit note ${creditNumber}`,
        lines: reverseLines(journalLines),
      },
      tx
    );
    if (creditOpenItemId) {
      await createOpenItem(
        {
          id: creditOpenItemId,
          companyId: params.companyId,
          partyType: "customer",
          partyId: invoice.customerId,
          docType: "credit_note_credit",
          docNumber: creditNumber,
          sourceId: noteId,
          issueDate: source.issueDate,
          dueDate: source.issueDate,
          amount: -allocation.unapplied,
          balance: -allocation.unapplied,
          currency: invoice.currency,
        },
        tx
      );
    }
    await applyItemStockDeltas(
      context
        .trackedLines(lines)
        .filter((line) => line.restock)
        .map((line) => ({ itemId: line.itemId, stockOnHandDelta: line.baseQuantity })),
      tx
    );

    const amounts = {
      ...invoice,
      amountCredited: roundMoney(invoice.amountCredited + allocation.applied),
    };
    const balance = outstandingBalance(amounts);
    await updateSalesInvoice(
      invoice.id,
      {
        amountCredited: amounts.amountCredited,
        creditNotesTotal: roundMoney(invoice.creditNotesTotal + totals.total),
        amountDebited: invoice.amountDebited,
        balance,
        status: settlementStatus(amounts, invoice.status),
      },
      tx
    );
    if (invoice.openItemId) {
      await updateOpenItemBalance(invoice.openItemId, balance, tx);
    }
    return { id: noteId, creditNumber, journalEntryId, total: totals.total };
  });
}

/** Issues a debit note: an existing draft, or a new note when `create` is given. */
export async function issueSalesDebitNote(
  params:
    | { noteId: string; issueDate: string; companyId: string; create?: undefined }
    | { create: NoteFields & { lines: DebitNoteLine[] }; companyId: string }
) {
  const context = await loadSalesContext(params.companyId);
  const newId = uuidv4();
  return db.runTransaction(async (tx) => {
    const draft = params.create ? null : await getSalesDebitNoteById(params.noteId, tx);
    if (!params.create) {
      if (!draft || draft.status !== "draft") {
        throw new PostingError("Debit note is locked");
      }
      if (draft.issueDate !== params.issueDate) {
        throw new PostingError("Debit note changed, try again", 409);
      }
    }
    const source = params.create ?? draft!;
    const invoice = assertNoteAllowed(
      await getSalesInvoiceById(source.invoiceId, tx),
      params.companyId
    );

    const lines = roundLineAmounts(source.lines);
    const { totals, journalLines } = context.post(lines);
    const noteId = draft?.id ?? newId;
    const journalEntryId = uuidv4();
    const issued = { ...totals, lines, status: "issued" as const, journalEntryId };
    let debitNumber = draft?.debitNumber ?? "";
    if (params.create) {
      const created = await createSalesDebitNote(
        {
          ...issued,
          id: noteId,
          companyId: params.companyId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          issueDate: source.issueDate,
          currency: source.currency ?? invoice.currency,
          notes: source.notes ?? null,
          reason: source.reason ?? null,
        },
        tx
      );
      debitNumber = created.debitNumber;
    } else {
      await updateSalesDebitNote(noteId, issued, tx);
    }

    await createJournalEntry(
      {
        id: journalEntryId,
        companyId: params.companyId,
        sourceType: "sales_debit_note",
        sourceId: noteId,
        date: source.issueDate,
        memo: `Debit note ${debitNumber}`,
        lines: journalLines,
      },
      tx
    );
    await applyItemStockDeltas(
      context
        .trackedLines(lines)
        .filter((line) => line.restock)
        .map((line) => ({ itemId: line.itemId, stockOnHandDelta: -line.baseQuantity })),
      tx
    );

    const amounts = {
      ...invoice,
      amountDebited: roundMoney(invoice.amountDebited + totals.total),
    };
    const balance = outstandingBalance(amounts);
    await updateSalesInvoice(
      invoice.id,
      {
        amountDebited: amounts.amountDebited,
        balance,
        status: settlementStatus(
          amounts,
          invoice.status === "sent" ? ("sent" as const) : ("approved" as const)
        ),
      },
      tx
    );
    if (invoice.openItemId) {
      await updateOpenItemBalance(invoice.openItemId, balance, tx);
    }
    return { id: noteId, debitNumber, journalEntryId, total: totals.total };
  });
}
