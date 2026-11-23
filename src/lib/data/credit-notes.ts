import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type CreditNoteStatus = "draft" | "issued" | "canceled";

export type CreditNoteLine = {
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

export type CreditNote = {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  creditNumber: string;
  status: CreditNoteStatus;
  issueDate: string;
  currency: string;
  notes?: string | null;
  reason?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  refundedAmount?: number;
  /** Part of the note that was already settled and is still owed back. */
  unappliedAmount: number;
  creditOpenItemId?: string | null;
  lines: CreditNoteLine[];
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapCreditNote(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    invoiceId: data.invoiceId,
    invoiceNumber: data.invoiceNumber,
    customerId: data.customerId,
    customerName: data.customerName,
    creditNumber: data.creditNumber,
    status: data.status,
    issueDate: data.issueDate,
    currency: data.currency ?? "SAR",
    notes: data.notes ?? null,
    reason: data.reason ?? null,
    subtotal: data.subtotal ?? 0,
    discountTotal: data.discountTotal ?? 0,
    taxTotal: data.taxTotal ?? 0,
    total: data.total ?? 0,
    refundedAmount: data.refundedAmount ?? 0,
    unappliedAmount: data.unappliedAmount ?? 0,
    creditOpenItemId: data.creditOpenItemId ?? null,
    lines: data.lines ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as CreditNote;
}

export async function listSalesCreditNotes(companyId: string) {
  const snapshot = await db
    .collection("sales_credit_notes")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapCreditNote);
}

export async function getSalesCreditNoteById(creditNoteId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("sales_credit_notes").doc(creditNoteId), tx);
  return doc.exists ? mapCreditNote(doc) : null;
}

export async function createSalesCreditNote(params: {
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
  status?: CreditNoteStatus;
  lines: CreditNoteLine[];
  journalEntryId?: string | null;
  unappliedAmount?: number;
  creditOpenItemId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const noteRef = db.collection("sales_credit_notes").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "credit",
      defaultPrefix: "CR-",
      collection: "sales_credit_notes",
      field: "creditNumber",
      date: params.issueDate,
    });
    const creditNumber = sequence.number;

    transaction.set(noteRef, {
      companyId: params.companyId,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      customerId: params.customerId,
      customerName: params.customerName,
      customerNameNormalized: normalizeSearch(params.customerName),
      creditNumber,
      creditNumberNormalized: normalizeSearch(creditNumber),
      status: params.status ?? "issued",
      issueDate: params.issueDate,
      currency: params.currency ?? "SAR",
      notes: params.notes ?? null,
      reason: params.reason ?? null,
      subtotal: params.subtotal,
      discountTotal: params.discountTotal,
      taxTotal: params.taxTotal,
      total: params.total,
      refundedAmount: 0,
      lines: params.lines,
      journalEntryId: params.journalEntryId ?? null,
      unappliedAmount: params.unappliedAmount ?? 0,
      creditOpenItemId: params.creditOpenItemId ?? null,
      createdAt: Timestamp.now(),
    });

    sequence.save();
    return creditNumber;
  };

  const creditNumber = tx ? await create(tx) : await db.runTransaction(create);
  return { id, creditNumber };
}

export async function updateSalesCreditNote(
  creditNoteId: string,
  updates: Partial<{
    status: CreditNoteStatus;
    issueDate: string;
    notes: string | null;
    reason: string | null;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    refundedAmount: number;
    lines: CreditNoteLine[];
    journalEntryId: string | null;
    unappliedAmount: number;
    creditOpenItemId: string | null;
  }>,
  tx?: Transaction
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  await writeDoc(db.collection("sales_credit_notes").doc(creditNoteId), payload, { merge: true, tx });
}
