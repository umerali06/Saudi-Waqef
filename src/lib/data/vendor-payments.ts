import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

export type VendorPaymentAllocation = {
  billId: string;
  billNumber: string;
  amount: number;
  openItemId?: string | null;
};

export type VendorPayment = {
  id: string;
  companyId: string;
  paymentNumber: string;
  paymentDate: string;
  vendorId: string;
  vendorName: string;
  method: string;
  accountId: string;
  reference?: string | null;
  currency: string;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  allocations: VendorPaymentAllocation[];
  journalEntryId?: string | null;
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  vendorPaymentPrefix: "VPAY-",
  vendorPaymentSuffix: "",
  vendorPaymentNextNumber: 1,
  vendorPaymentPadding: 0,
  vendorPaymentResetYearly: false,
  vendorPaymentLastResetYear: null as number | null,
};

export async function listVendorPayments(companyId: string) {
  const snapshot = await db
    .collection("vendor_payments")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      paymentNumber: data.paymentNumber,
      paymentDate: data.paymentDate,
      vendorId: data.vendorId,
      vendorName: data.vendorName,
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
    } as VendorPayment;
  });
}

export async function getVendorPaymentById(paymentId: string) {
  const doc = await db.collection("vendor_payments").doc(paymentId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    paymentNumber: data.paymentNumber,
    paymentDate: data.paymentDate,
    vendorId: data.vendorId,
    vendorName: data.vendorName,
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
  } as VendorPayment;
}

export async function createVendorPayment(params: {
  companyId: string;
  paymentDate: string;
  vendorId: string;
  vendorName: string;
  method: string;
  accountId: string;
  reference?: string | null;
  currency?: string | null;
  totalAmount: number;
  appliedAmount: number;
  unappliedAmount: number;
  allocations: VendorPaymentAllocation[];
  journalEntryId?: string | null;
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const paymentRef = db.collection("vendor_payments").doc(id);

  let paymentNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.exists ? configSnap.data() : {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.vendorPaymentPrefix === "string"
          ? config.vendorPaymentPrefix
          : DEFAULT_CONFIG.vendorPaymentPrefix,
      suffix:
        typeof config.vendorPaymentSuffix === "string"
          ? config.vendorPaymentSuffix
          : DEFAULT_CONFIG.vendorPaymentSuffix,
      nextNumber:
        typeof config.vendorPaymentNextNumber === "number"
          ? config.vendorPaymentNextNumber
          : DEFAULT_CONFIG.vendorPaymentNextNumber,
      padding:
        typeof config.vendorPaymentPadding === "number"
          ? config.vendorPaymentPadding
          : DEFAULT_CONFIG.vendorPaymentPadding,
      resetYearly:
        typeof config.vendorPaymentResetYearly === "boolean"
          ? config.vendorPaymentResetYearly
          : DEFAULT_CONFIG.vendorPaymentResetYearly,
      lastResetYear:
        typeof config.vendorPaymentLastResetYear === "number"
          ? config.vendorPaymentLastResetYear
          : DEFAULT_CONFIG.vendorPaymentLastResetYear,
      date: params.paymentDate,
    });
    paymentNumber = sequence.number;

    tx.set(paymentRef, {
      companyId: params.companyId,
      paymentNumber,
      paymentNumberNormalized: normalizeSearch(paymentNumber),
      paymentDate: params.paymentDate,
      vendorId: params.vendorId,
      vendorName: params.vendorName,
      vendorNameNormalized: normalizeSearch(params.vendorName),
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
        vendorPaymentNextNumber: sequence.nextNumber,
        vendorPaymentLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

  return { id, paymentNumber };
}
