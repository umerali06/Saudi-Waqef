import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type VendorCreditNoteStatus = "draft" | "issued" | "canceled";

export type VendorCreditNoteLine = {
  id: string;
  billLineId?: string | null;
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
  returnToVendor: boolean;
};

export type VendorCreditNote = {
  id: string;
  companyId: string;
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  creditNumber: string;
  status: VendorCreditNoteStatus;
  issueDate: string;
  currency: string;
  notes?: string | null;
  reason?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  /** Part of the note that was already settled and is still owed back. */
  unappliedAmount: number;
  creditOpenItemId?: string | null;
  lines: VendorCreditNoteLine[];
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapVendorCreditNote(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    billId: data.billId,
    billNumber: data.billNumber,
    vendorId: data.vendorId,
    vendorName: data.vendorName,
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
    unappliedAmount: data.unappliedAmount ?? 0,
    creditOpenItemId: data.creditOpenItemId ?? null,
    lines: data.lines ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as VendorCreditNote;
}

export async function listVendorCreditNotes(companyId: string) {
  const snapshot = await db
    .collection("vendor_credit_notes")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapVendorCreditNote);
}

export async function getVendorCreditNoteById(creditNoteId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("vendor_credit_notes").doc(creditNoteId), tx);
  return doc.exists ? mapVendorCreditNote(doc) : null;
}

export async function createVendorCreditNote(params: {
  id?: string;
  companyId: string;
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  issueDate: string;
  currency?: string | null;
  notes?: string | null;
  reason?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  status?: VendorCreditNoteStatus;
  lines: VendorCreditNoteLine[];
  journalEntryId?: string | null;
  unappliedAmount?: number;
  creditOpenItemId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const noteRef = db.collection("vendor_credit_notes").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "vendorCredit",
      defaultPrefix: "VCR-",
      collection: "vendor_credit_notes",
      field: "creditNumber",
      date: params.issueDate,
    });
    const creditNumber = sequence.number;

    transaction.set(noteRef, {
      companyId: params.companyId,
      billId: params.billId,
      billNumber: params.billNumber,
      vendorId: params.vendorId,
      vendorName: params.vendorName,
      vendorNameNormalized: normalizeSearch(params.vendorName),
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

export async function updateVendorCreditNote(
  creditNoteId: string,
  updates: Partial<{
    status: VendorCreditNoteStatus;
    issueDate: string;
    notes: string | null;
    reason: string | null;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    lines: VendorCreditNoteLine[];
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
  await writeDoc(db.collection("vendor_credit_notes").doc(creditNoteId), payload, { merge: true, tx });
}
