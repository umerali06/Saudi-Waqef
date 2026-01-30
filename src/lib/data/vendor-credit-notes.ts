import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

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
  lines: VendorCreditNoteLine[];
  journalEntryId?: string | null;
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  vendorCreditPrefix: "VCR-",
  vendorCreditSuffix: "",
  vendorCreditNextNumber: 1,
  vendorCreditPadding: 0,
  vendorCreditResetYearly: false,
  vendorCreditLastResetYear: null as number | null,
};

export async function listVendorCreditNotes(companyId: string) {
  const snapshot = await db
    .collection("vendor_credit_notes")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
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
      lines: data.lines ?? [],
      journalEntryId: data.journalEntryId ?? null,
      createdAt: data.createdAt.toDate(),
    } as VendorCreditNote;
  });
}

export async function getVendorCreditNoteById(creditNoteId: string) {
  const doc = await db.collection("vendor_credit_notes").doc(creditNoteId).get();
  if (!doc.exists) {
    return null;
  }
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
    lines: data.lines ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as VendorCreditNote;
}

export async function createVendorCreditNote(params: {
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
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const noteRef = db.collection("vendor_credit_notes").doc(id);

  let creditNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.exists ? configSnap.data() : {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.vendorCreditPrefix === "string"
          ? config.vendorCreditPrefix
          : DEFAULT_CONFIG.vendorCreditPrefix,
      suffix:
        typeof config.vendorCreditSuffix === "string"
          ? config.vendorCreditSuffix
          : DEFAULT_CONFIG.vendorCreditSuffix,
      nextNumber:
        typeof config.vendorCreditNextNumber === "number"
          ? config.vendorCreditNextNumber
          : DEFAULT_CONFIG.vendorCreditNextNumber,
      padding:
        typeof config.vendorCreditPadding === "number"
          ? config.vendorCreditPadding
          : DEFAULT_CONFIG.vendorCreditPadding,
      resetYearly:
        typeof config.vendorCreditResetYearly === "boolean"
          ? config.vendorCreditResetYearly
          : DEFAULT_CONFIG.vendorCreditResetYearly,
      lastResetYear:
        typeof config.vendorCreditLastResetYear === "number"
          ? config.vendorCreditLastResetYear
          : DEFAULT_CONFIG.vendorCreditLastResetYear,
      date: params.issueDate,
    });
    creditNumber = sequence.number;

    tx.set(noteRef, {
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
      createdAt: Timestamp.now(),
    });

    tx.set(
      configRef,
      {
        vendorCreditNextNumber: sequence.nextNumber,
        vendorCreditLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

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
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  await db.collection("vendor_credit_notes").doc(creditNoteId).set(payload, {
    merge: true,
  });
}
