import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type DebitNoteStatus = "draft" | "issued" | "canceled";

export type DebitNoteLine = {
  id: string;
  invoiceLineId?: string | null;
  itemId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  taxCategoryId?: string | null;
  taxRate: number;
  taxAmount: number;
  netAmount: number;
  totalAmount: number;
  baseQuantity: number;
  restock: boolean;
};

export type DebitNote = {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  debitNumber: string;
  status: DebitNoteStatus;
  issueDate: string;
  currency: string;
  notes?: string | null;
  reason?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  lines: DebitNoteLine[];
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapDebitNote(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    invoiceId: data.invoiceId,
    invoiceNumber: data.invoiceNumber,
    customerId: data.customerId,
    customerName: data.customerName,
    debitNumber: data.debitNumber,
    status: data.status,
    issueDate: data.issueDate,
    currency: data.currency ?? "SAR",
    notes: data.notes ?? null,
    reason: data.reason ?? null,
    subtotal: data.subtotal ?? 0,
    discountTotal: data.discountTotal ?? 0,
    taxTotal: data.taxTotal ?? 0,
    total: data.total ?? 0,
    lines: data.lines ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as DebitNote;
}

export async function listSalesDebitNotes(companyId: string) {
  const snapshot = await db
    .collection("sales_debit_notes")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapDebitNote);
}

export async function getSalesDebitNoteById(debitNoteId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("sales_debit_notes").doc(debitNoteId), tx);
  return doc.exists ? mapDebitNote(doc) : null;
}

export async function createSalesDebitNote(params: {
  id?: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  currency?: string | null;
  notes?: string | null;
  reason?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  status?: DebitNoteStatus;
  lines: DebitNoteLine[];
  journalEntryId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const noteRef = db.collection("sales_debit_notes").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "debit",
      defaultPrefix: "DR-",
      collection: "sales_debit_notes",
      field: "debitNumber",
      date: params.issueDate,
    });
    const debitNumber = sequence.number;

    transaction.set(noteRef, {
      companyId: params.companyId,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      customerId: params.customerId,
      customerName: params.customerName,
      customerNameNormalized: normalizeSearch(params.customerName),
      debitNumber,
      debitNumberNormalized: normalizeSearch(debitNumber),
      status: params.status ?? "issued",
      issueDate: params.issueDate,
      currency: params.currency ?? "SAR",
      notes: params.notes ?? null,
      reason: params.reason ?? null,
      subtotal: params.subtotal,
      discountTotal: params.discountTotal,
      taxTotal: params.taxTotal,
      total: params.total,
      lines: params.lines,
      journalEntryId: params.journalEntryId ?? null,
      createdAt: Timestamp.now(),
    });

    sequence.save();
    return debitNumber;
  };

  const debitNumber = tx ? await create(tx) : await db.runTransaction(create);
  return { id, debitNumber };
}

export async function updateSalesDebitNote(
  debitNoteId: string,
  updates: Partial<{
    status: DebitNoteStatus;
    issueDate: string;
    notes: string | null;
    reason: string | null;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    lines: DebitNoteLine[];
    journalEntryId: string | null;
  }>,
  tx?: Transaction
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  await writeDoc(db.collection("sales_debit_notes").doc(debitNoteId), payload, { merge: true, tx });
}
