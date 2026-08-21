import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

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
  refundedAmount?: number;
  lines: DebitNoteLine[];
  journalEntryId?: string | null;
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  debitPrefix: "DR-",
  debitSuffix: "",
  debitNextNumber: 1,
  debitPadding: 0,
  debitResetYearly: false,
  debitLastResetYear: null as number | null,
};

export async function listSalesDebitNotes(companyId: string) {
  const snapshot = await db
    .collection("sales_debit_notes")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
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
      refundedAmount: data.refundedAmount ?? 0,
      lines: data.lines ?? [],
      journalEntryId: data.journalEntryId ?? null,
      createdAt: data.createdAt.toDate(),
    } as DebitNote;
  });
}

export async function getSalesDebitNoteById(debitNoteId: string) {
  const doc = await db.collection("sales_debit_notes").doc(debitNoteId).get();
  if (!doc.exists) {
    return null;
  }
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
    refundedAmount: data.refundedAmount ?? 0,
    lines: data.lines ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as DebitNote;
}

export async function createSalesDebitNote(params: {
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
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const noteRef = db.collection("sales_debit_notes").doc(id);

  let debitNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.data() ?? {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.debitPrefix === "string"
          ? config.debitPrefix
          : DEFAULT_CONFIG.debitPrefix,
      suffix:
        typeof config.debitSuffix === "string"
          ? config.debitSuffix
          : DEFAULT_CONFIG.debitSuffix,
      nextNumber:
        typeof config.debitNextNumber === "number"
          ? config.debitNextNumber
          : DEFAULT_CONFIG.debitNextNumber,
      padding:
        typeof config.debitPadding === "number"
          ? config.debitPadding
          : DEFAULT_CONFIG.debitPadding,
      resetYearly:
        typeof config.debitResetYearly === "boolean"
          ? config.debitResetYearly
          : DEFAULT_CONFIG.debitResetYearly,
      lastResetYear:
        typeof config.debitLastResetYear === "number"
          ? config.debitLastResetYear
          : DEFAULT_CONFIG.debitLastResetYear,
      date: params.issueDate,
    });
    debitNumber = sequence.number;

    tx.set(noteRef, {
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
      refundedAmount: 0,
      lines: params.lines,
      journalEntryId: params.journalEntryId ?? null,
      createdAt: Timestamp.now(),
    });

    tx.set(
      configRef,
      {
        debitNextNumber: sequence.nextNumber,
        debitLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

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
    refundedAmount: number;
    lines: DebitNoteLine[];
    journalEntryId: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  await db.collection("sales_debit_notes").doc(debitNoteId).set(payload, {
    merge: true,
  });
}
