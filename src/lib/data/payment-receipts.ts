import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

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
  allocations: ReceiptAllocation[];
  journalEntryId?: string | null;
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  receiptPrefix: "RCPT-",
  receiptSuffix: "",
  receiptNextNumber: 1,
  receiptPadding: 0,
  receiptResetYearly: false,
  receiptLastResetYear: null as number | null,
};

export async function listPaymentReceipts(companyId: string) {
  const snapshot = await db
    .collection("payment_receipts")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
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
      allocations: data.allocations ?? [],
      journalEntryId: data.journalEntryId ?? null,
      createdAt: data.createdAt.toDate(),
    } as PaymentReceipt;
  });
}

export async function getPaymentReceiptById(receiptId: string) {
  const doc = await db.collection("payment_receipts").doc(receiptId).get();
  if (!doc.exists) {
    return null;
  }
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
    allocations: data.allocations ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as PaymentReceipt;
}

export async function createPaymentReceipt(params: {
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
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const receiptRef = db.collection("payment_receipts").doc(id);

  let receiptNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.data() ?? {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.receiptPrefix === "string"
          ? config.receiptPrefix
          : DEFAULT_CONFIG.receiptPrefix,
      suffix:
        typeof config.receiptSuffix === "string"
          ? config.receiptSuffix
          : DEFAULT_CONFIG.receiptSuffix,
      nextNumber:
        typeof config.receiptNextNumber === "number"
          ? config.receiptNextNumber
          : DEFAULT_CONFIG.receiptNextNumber,
      padding:
        typeof config.receiptPadding === "number"
          ? config.receiptPadding
          : DEFAULT_CONFIG.receiptPadding,
      resetYearly:
        typeof config.receiptResetYearly === "boolean"
          ? config.receiptResetYearly
          : DEFAULT_CONFIG.receiptResetYearly,
      lastResetYear:
        typeof config.receiptLastResetYear === "number"
          ? config.receiptLastResetYear
          : DEFAULT_CONFIG.receiptLastResetYear,
      date: params.receiptDate,
    });
    receiptNumber = sequence.number;

    tx.set(receiptRef, {
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
      createdAt: Timestamp.now(),
    });

    tx.set(
      configRef,
      {
        receiptNextNumber: sequence.nextNumber,
        receiptLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

  return { id, receiptNumber };
}
