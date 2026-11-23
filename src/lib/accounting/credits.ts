import { db } from "@/lib/firebase/admin";
import { PostingError } from "@/lib/accounting/errors";
import { payBill, payInvoice, readPayableBills, readPayableInvoices } from "@/lib/accounting/payments";
import { getSalesCreditNoteById, updateSalesCreditNote } from "@/lib/data/credit-notes";
import { getOpenItemById, listOpenItems, updateOpenItemBalance } from "@/lib/data/open-items";
import type { OpenItem, PartyType } from "@/lib/data/open-items";
import {
  getPaymentReceiptById,
  listPaymentReceipts,
  updatePaymentReceipt,
} from "@/lib/data/payment-receipts";
import { updatePurchaseBill } from "@/lib/data/purchase-bills";
import { updateSalesInvoice } from "@/lib/data/sales-invoices";
import { getVendorCreditNoteById, updateVendorCreditNote } from "@/lib/data/vendor-credit-notes";
import {
  getVendorPaymentById,
  listVendorPayments,
  updateVendorPayment,
} from "@/lib/data/vendor-payments";
import { roundMoney } from "@/lib/utils/invoice";
import { exceedsBalance, outstandingBalance, settlementStatus } from "@/lib/utils/settlement";

const laterDate = (first: string, second: string) => (first > second ? first : second);

/** Credits saved before they carried a source are matched by document number. */
async function findSourceId(item: OpenItem) {
  if (item.sourceId) {
    return item.sourceId;
  }
  if (item.docType === "receipt_credit") {
    const receipts = await listPaymentReceipts(item.companyId);
    return receipts.find((receipt) => receipt.receiptNumber === item.docNumber)?.id ?? null;
  }
  if (item.docType === "vendor_payment_credit") {
    const payments = await listVendorPayments(item.companyId);
    return payments.find((payment) => payment.paymentNumber === item.docNumber)?.id ?? null;
  }
  return null;
}

/** The open item that holds what is left of a receipt or vendor payment. */
export async function findCreditOpenItemId(params: {
  companyId: string;
  partyType: PartyType;
  partyId: string;
  docType: string;
  docNumber: string;
  storedId?: string | null;
}) {
  if (params.storedId) {
    return params.storedId;
  }
  const items = await listOpenItems(params.companyId, params.partyType, params.partyId);
  return (
    items.find(
      (item) => item.docType === params.docType && item.docNumber === params.docNumber
    )?.id ?? null
  );
}

/**
 * Settles invoices or bills with a credit the party already has. Both sides sit
 * in the same receivable or payable account, so nothing is posted.
 */
export async function applyCredit(params: {
  openItemId: string;
  companyId: string;
  allocations: Array<{ documentId: string; amount: number }>;
}) {
  const item = await getOpenItemById(params.openItemId);
  if (!item || item.companyId !== params.companyId) {
    throw new PostingError("Not found", 404);
  }
  const sourceId = await findSourceId(item);
  if (!sourceId) {
    throw new PostingError("Credit cannot be applied");
  }
  const applied = roundMoney(
    params.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
  );

  return db.runTransaction(async (tx) => {
    const current = await getOpenItemById(params.openItemId, tx);
    if (!current || exceedsBalance(applied, -current.balance)) {
      throw new PostingError("Amount exceeds credit");
    }
    const remaining = roundMoney(-current.balance - applied);

    if (current.docType === "receipt_credit") {
      const receipt = await getPaymentReceiptById(sourceId, tx);
      const targets = await readPayableInvoices(tx, {
        companyId: params.companyId,
        customerId: current.partyId,
        allocations: params.allocations.map(({ documentId, amount }) => ({
          invoiceId: documentId,
          amount,
        })),
      });
      if (!receipt) {
        throw new PostingError("Credit cannot be applied");
      }
      for (const { invoice, amount } of targets) {
        await payInvoice(tx, invoice, {
          amount,
          paymentDate: laterDate(receipt.receiptDate, invoice.invoiceDate),
          method: receipt.method,
          reference: receipt.receiptNumber,
          accountId: receipt.accountId,
          journalEntryId: receipt.journalEntryId ?? null,
        });
      }
      await updatePaymentReceipt(
        receipt.id,
        {
          appliedAmount: roundMoney(receipt.appliedAmount + applied),
          unappliedAmount: remaining,
          allocations: [
            ...receipt.allocations,
            ...targets.map(({ invoice, amount }) => ({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amount,
              openItemId: invoice.openItemId ?? null,
            })),
          ],
        },
        tx
      );
    } else if (current.docType === "credit_note_credit") {
      const note = await getSalesCreditNoteById(sourceId, tx);
      const targets = await readPayableInvoices(tx, {
        companyId: params.companyId,
        customerId: current.partyId,
        allocations: params.allocations.map(({ documentId, amount }) => ({
          invoiceId: documentId,
          amount,
        })),
      });
      if (!note) {
        throw new PostingError("Credit cannot be applied");
      }
      for (const { invoice, amount } of targets) {
        const amounts = {
          ...invoice,
          amountCredited: roundMoney(invoice.amountCredited + amount),
        };
        const balance = outstandingBalance(amounts);
        await updateSalesInvoice(
          invoice.id,
          {
            amountCredited: amounts.amountCredited,
            creditNotesTotal: invoice.creditNotesTotal,
            amountDebited: invoice.amountDebited,
            balance,
            status: settlementStatus(amounts, invoice.status),
          },
          tx
        );
        if (invoice.openItemId) {
          await updateOpenItemBalance(invoice.openItemId, balance, tx);
        }
      }
      await updateSalesCreditNote(note.id, { unappliedAmount: remaining }, tx);
    } else if (current.docType === "vendor_payment_credit") {
      const payment = await getVendorPaymentById(sourceId, tx);
      const targets = await readPayableBills(tx, {
        companyId: params.companyId,
        vendorId: current.partyId,
        allocations: params.allocations.map(({ documentId, amount }) => ({
          billId: documentId,
          amount,
        })),
      });
      if (!payment) {
        throw new PostingError("Credit cannot be applied");
      }
      for (const { bill, amount } of targets) {
        await payBill(tx, bill, {
          amount,
          paymentDate: laterDate(payment.paymentDate, bill.billDate),
          method: payment.method,
          reference: payment.paymentNumber,
          accountId: payment.accountId,
          journalEntryId: payment.journalEntryId ?? null,
        });
      }
      await updateVendorPayment(
        payment.id,
        {
          appliedAmount: roundMoney(payment.appliedAmount + applied),
          unappliedAmount: remaining,
          allocations: [
            ...payment.allocations,
            ...targets.map(({ bill, amount }) => ({
              billId: bill.id,
              billNumber: bill.billNumber,
              amount,
              openItemId: bill.openItemId ?? null,
            })),
          ],
        },
        tx
      );
    } else if (current.docType === "vendor_credit_note_credit") {
      const note = await getVendorCreditNoteById(sourceId, tx);
      const targets = await readPayableBills(tx, {
        companyId: params.companyId,
        vendorId: current.partyId,
        allocations: params.allocations.map(({ documentId, amount }) => ({
          billId: documentId,
          amount,
        })),
      });
      if (!note) {
        throw new PostingError("Credit cannot be applied");
      }
      for (const { bill, amount } of targets) {
        const amounts = {
          ...bill,
          amountCredited: roundMoney(bill.amountCredited + amount),
        };
        const balance = outstandingBalance(amounts);
        await updatePurchaseBill(
          bill.id,
          {
            amountCredited: amounts.amountCredited,
            creditNotesTotal: bill.creditNotesTotal,
            balance,
            status: settlementStatus(amounts, bill.status),
          },
          tx
        );
        if (bill.openItemId) {
          await updateOpenItemBalance(bill.openItemId, balance, tx);
        }
      }
      await updateVendorCreditNote(note.id, { unappliedAmount: remaining }, tx);
    } else {
      throw new PostingError("Credit cannot be applied");
    }

    await updateOpenItemBalance(current.id, remaining === 0 ? 0 : -remaining, tx);
    return { applied, remaining };
  });
}
