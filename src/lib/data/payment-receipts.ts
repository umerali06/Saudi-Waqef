import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type ReceiptAllocation = {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  openItemId?: string | null;
};

export type PaymentReceipt = {
  id: string;
  companyId: string;
  receiptNumber: string;
  receiptDate: string;
  customerId: string;
  customerName: string;
  method: string;
  accountId: string;
  reference?: string | null;
  currency: string;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  creditOpenItemId?: string | null;
  allocations: ReceiptAllocation[];
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapPaymentReceipt(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    receiptNumber: data.receiptNumber,
    receiptDate: data.receiptDate,
    customerId: data.customerId,
    customerName: data.customerName,
    method: data.method,
    accountId: data.accountId,
    reference: data.reference ?? null,
    currency: data.currency ?? "SAR",
    totalAmount: data.totalAmount ?? 0,
    appliedAmount: data.appliedAmount ?? 0,
    unappliedAmount: data.unappliedAmount ?? 0,
    creditOpenItemId: data.creditOpenItemId ?? null,
    allocations: data.allocations ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as PaymentReceipt;
}

export async function listPaymentReceipts(companyId: string) {
  const snapshot = await db
    .collection("payment_receipts")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapPaymentReceipt);
}

export async function getPaymentReceiptById(receiptId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("payment_receipts").doc(receiptId), tx);
  return doc.exists ? mapPaymentReceipt(doc) : null;
}

export async function createPaymentReceipt(params: {
  id?: string;
  companyId: string;
  receiptDate: string;
  customerId: string;
  customerName: string;
  method: string;
  accountId: string;
  reference?: string | null;
  currency?: string | null;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  allocations: ReceiptAllocation[];
  journalEntryId?: string | null;
  creditOpenItemId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const receiptRef = db.collection("payment_receipts").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "receipt",
      defaultPrefix: "RCPT-",
      collection: "payment_receipts",
      field: "receiptNumber",
      date: params.receiptDate,
    });
    const receiptNumber = sequence.number;

    transaction.set(receiptRef, {
      companyId: params.companyId,
      receiptNumber,
      receiptNumberNormalized: normalizeSearch(receiptNumber),
      receiptDate: params.receiptDate,
      customerId: params.customerId,
      customerName: params.customerName,
      customerNameNormalized: normalizeSearch(params.customerName),
      method: params.method,
      accountId: params.accountId,
      reference: params.reference ?? null,
      currency: params.currency ?? "SAR",
      totalAmount: params.totalAmount,
      appliedAmount: params.appliedAmount,
      unappliedAmount: params.unappliedAmount,
      allocations: params.allocations,
      journalEntryId: params.journalEntryId ?? null,
      creditOpenItemId: params.creditOpenItemId ?? null,
      createdAt: Timestamp.now(),
    });

    sequence.save();
    return receiptNumber;
  };

  const receiptNumber = tx ? await create(tx) : await db.runTransaction(create);
  return { id, receiptNumber };
}

export async function updatePaymentReceipt(
  receiptId: string,
  updates: Partial<{
    appliedAmount: number;
    unappliedAmount: number;
    allocations: ReceiptAllocation[];
  }>,
  tx?: Transaction
) {
  await writeDoc(
    db.collection("payment_receipts").doc(receiptId),
    { ...updates, updatedAt: Timestamp.now() },
    { merge: true, tx }
  );
}
