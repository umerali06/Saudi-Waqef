import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

export type BillStatus =
  | "draft"
  | "approved"
  | "partially_paid"
  | "paid"
  | "canceled";

export type BillLine = {
  id: string;
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
  expenseAccountId?: string | null;
};

export type PurchaseBill = {
  id: string;
  companyId: string;
  vendorId: string;
  vendorName: string;
  vendorVatNumber?: string;
  remittanceAddress?: string;
  billNumber: string;
  vendorBillNumber?: string | null;
  status: BillStatus;
  billDate: string;
  dueDate: string;
  currency: string;
  paymentTermId?: string | null;
  notes?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountCredited: number;
  balance: number;
  lines: BillLine[];
  openItemId?: string | null;
  journalEntryId?: string | null;
  approvedAt?: string | null;
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  billPrefix: "BILL-",
  billSuffix: "",
  billNextNumber: 1,
  billPadding: 0,
  billResetYearly: false,
  billLastResetYear: null as number | null,
};

export async function listPurchaseBills(companyId: string) {
  const snapshot = await db
    .collection("purchase_bills")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      vendorId: data.vendorId,
      vendorName: data.vendorName,
      vendorVatNumber: data.vendorVatNumber ?? undefined,
      remittanceAddress: data.remittanceAddress ?? undefined,
      billNumber: data.billNumber,
      vendorBillNumber: data.vendorBillNumber ?? null,
      status: data.status,
      billDate: data.billDate,
      dueDate: data.dueDate,
      currency: data.currency ?? "SAR",
      paymentTermId: data.paymentTermId ?? null,
      notes: data.notes ?? null,
      subtotal: data.subtotal ?? 0,
      discountTotal: data.discountTotal ?? 0,
      taxTotal: data.taxTotal ?? 0,
      total: data.total ?? 0,
      amountPaid: data.amountPaid ?? 0,
      amountCredited: data.amountCredited ?? 0,
      balance: data.balance ?? 0,
      lines: data.lines ?? [],
      openItemId: data.openItemId ?? null,
      journalEntryId: data.journalEntryId ?? null,
      approvedAt: data.approvedAt ?? null,
      createdAt: data.createdAt.toDate(),
    } as PurchaseBill;
  });
}

export async function getPurchaseBillById(billId: string) {
  const doc = await db.collection("purchase_bills").doc(billId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    vendorId: data.vendorId,
    vendorName: data.vendorName,
    vendorVatNumber: data.vendorVatNumber ?? undefined,
    remittanceAddress: data.remittanceAddress ?? undefined,
    billNumber: data.billNumber,
    vendorBillNumber: data.vendorBillNumber ?? null,
    status: data.status,
    billDate: data.billDate,
    dueDate: data.dueDate,
    currency: data.currency ?? "SAR",
    paymentTermId: data.paymentTermId ?? null,
    notes: data.notes ?? null,
    subtotal: data.subtotal ?? 0,
    discountTotal: data.discountTotal ?? 0,
    taxTotal: data.taxTotal ?? 0,
    total: data.total ?? 0,
    amountPaid: data.amountPaid ?? 0,
    amountCredited: data.amountCredited ?? 0,
    balance: data.balance ?? 0,
    lines: data.lines ?? [],
    openItemId: data.openItemId ?? null,
    journalEntryId: data.journalEntryId ?? null,
    approvedAt: data.approvedAt ?? null,
    createdAt: data.createdAt.toDate(),
  } as PurchaseBill;
}

export async function createPurchaseBill(params: {
  companyId: string;
  vendorId: string;
  vendorName: string;
  vendorVatNumber?: string | null;
  remittanceAddress?: string | null;
  vendorBillNumber?: string | null;
  billDate: string;
  dueDate: string;
  currency?: string | null;
  paymentTermId?: string | null;
  notes?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  amountCredited?: number;
  balance?: number;
  status?: BillStatus;
  lines: BillLine[];
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const billRef = db.collection("purchase_bills").doc(id);

  let billNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.data() ?? {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.billPrefix === "string"
          ? config.billPrefix
          : DEFAULT_CONFIG.billPrefix,
      suffix:
        typeof config.billSuffix === "string"
          ? config.billSuffix
          : DEFAULT_CONFIG.billSuffix,
      nextNumber:
        typeof config.billNextNumber === "number"
          ? config.billNextNumber
          : DEFAULT_CONFIG.billNextNumber,
      padding:
        typeof config.billPadding === "number"
          ? config.billPadding
          : DEFAULT_CONFIG.billPadding,
      resetYearly:
        typeof config.billResetYearly === "boolean"
          ? config.billResetYearly
          : DEFAULT_CONFIG.billResetYearly,
      lastResetYear:
        typeof config.billLastResetYear === "number"
          ? config.billLastResetYear
          : DEFAULT_CONFIG.billLastResetYear,
      date: params.billDate,
    });
    billNumber = sequence.number;

    const vendorBillNumber = params.vendorBillNumber?.trim() || null;
    const vendorBillNormalized = vendorBillNumber
      ? normalizeSearch(vendorBillNumber)
      : null;

    tx.set(billRef, {
      companyId: params.companyId,
      vendorId: params.vendorId,
      vendorName: params.vendorName,
      vendorNameNormalized: normalizeSearch(params.vendorName),
      vendorVatNumber: params.vendorVatNumber ?? null,
      remittanceAddress: params.remittanceAddress ?? null,
      billNumber,
      billNumberNormalized: normalizeSearch(billNumber),
      vendorBillNumber,
      vendorBillNumberNormalized: vendorBillNormalized,
      status: params.status ?? "draft",
      billDate: params.billDate,
      dueDate: params.dueDate,
      currency: params.currency ?? "SAR",
      paymentTermId: params.paymentTermId ?? null,
      notes: params.notes ?? null,
      subtotal: params.subtotal,
      discountTotal: params.discountTotal,
      taxTotal: params.taxTotal,
      total: params.total,
      amountPaid: params.amountPaid ?? 0,
      amountCredited: params.amountCredited ?? 0,
      balance: params.balance ?? params.total,
      lines: params.lines,
      createdAt: Timestamp.now(),
    });

    tx.set(
      configRef,
      {
        billNextNumber: sequence.nextNumber,
        billLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

  return { id, billNumber };
}

export async function updatePurchaseBill(
  billId: string,
  updates: Partial<{
    vendorId: string;
    vendorName: string;
    vendorVatNumber: string | null;
    remittanceAddress: string | null;
    vendorBillNumber: string | null;
    billDate: string;
    dueDate: string;
    currency: string | null;
    paymentTermId: string | null;
    notes: string | null;
    status: BillStatus;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    amountPaid: number;
    amountCredited: number;
    balance: number;
    lines: BillLine[];
    openItemId: string | null;
    journalEntryId: string | null;
    approvedAt: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.vendorName) {
    payload.vendorNameNormalized = normalizeSearch(updates.vendorName);
  }
  if (updates.vendorBillNumber !== undefined) {
    const normalized = updates.vendorBillNumber
      ? normalizeSearch(updates.vendorBillNumber)
      : null;
    payload.vendorBillNumberNormalized = normalized;
  }
  await db.collection("purchase_bills").doc(billId).set(payload, { merge: true });
}
