import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

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
  lines: CreditNoteLine[];
  journalEntryId?: string | null;
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  creditPrefix: "CR-",
  creditSuffix: "",
  creditNextNumber: 1,
  creditPadding: 0,
  creditResetYearly: false,
  creditLastResetYear: null as number | null,
};

export async function listSalesCreditNotes(companyId: string) {
  const snapshot = await db
    .collection("sales_credit_notes")
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
      lines: data.lines ?? [],
      journalEntryId: data.journalEntryId ?? null,
      createdAt: data.createdAt.toDate(),
    } as CreditNote;
  });
}

export async function getSalesCreditNoteById(creditNoteId: string) {
  const doc = await db.collection("sales_credit_notes").doc(creditNoteId).get();
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
    lines: data.lines ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as CreditNote;
}

export async function createSalesCreditNote(params: {
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
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const noteRef = db.collection("sales_credit_notes").doc(id);

  let creditNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.exists ? configSnap.data() : {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.creditPrefix === "string"
          ? config.creditPrefix
          : DEFAULT_CONFIG.creditPrefix,
      suffix:
        typeof config.creditSuffix === "string"
          ? config.creditSuffix
          : DEFAULT_CONFIG.creditSuffix,
      nextNumber:
        typeof config.creditNextNumber === "number"
          ? config.creditNextNumber
          : DEFAULT_CONFIG.creditNextNumber,
      padding:
        typeof config.creditPadding === "number"
          ? config.creditPadding
          : DEFAULT_CONFIG.creditPadding,
      resetYearly:
        typeof config.creditResetYearly === "boolean"
          ? config.creditResetYearly
          : DEFAULT_CONFIG.creditResetYearly,
      lastResetYear:
        typeof config.creditLastResetYear === "number"
          ? config.creditLastResetYear
          : DEFAULT_CONFIG.creditLastResetYear,
      date: params.issueDate,
    });
    creditNumber = sequence.number;

    tx.set(noteRef, {
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
      createdAt: Timestamp.now(),
    });

    tx.set(
      configRef,
      {
        creditNextNumber: sequence.nextNumber,
        creditLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

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
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  await db.collection("sales_credit_notes").doc(creditNoteId).set(payload, {
    merge: true,
  });
}
