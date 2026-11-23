import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

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
  creditOpenItemId?: string | null;
  allocations: VendorPaymentAllocation[];
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapVendorPayment(doc: DocumentSnapshot) {
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
    creditOpenItemId: data.creditOpenItemId ?? null,
    allocations: data.allocations ?? [],
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as VendorPayment;
}

export async function listVendorPayments(companyId: string) {
  const snapshot = await db
    .collection("vendor_payments")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapVendorPayment);
}

export async function getVendorPaymentById(paymentId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("vendor_payments").doc(paymentId), tx);
  return doc.exists ? mapVendorPayment(doc) : null;
}

export async function createVendorPayment(params: {
  id?: string;
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
  creditOpenItemId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const paymentRef = db.collection("vendor_payments").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "vendorPayment",
      defaultPrefix: "VPAY-",
      collection: "vendor_payments",
      field: "paymentNumber",
      date: params.paymentDate,
    });
    const paymentNumber = sequence.number;

    transaction.set(paymentRef, {
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
      creditOpenItemId: params.creditOpenItemId ?? null,
      createdAt: Timestamp.now(),
    });

    sequence.save();
    return paymentNumber;
  };

  const paymentNumber = tx ? await create(tx) : await db.runTransaction(create);
  return { id, paymentNumber };
}

export async function updateVendorPayment(
  paymentId: string,
  updates: Partial<{
    appliedAmount: number;
    unappliedAmount: number;
    allocations: VendorPaymentAllocation[];
  }>,
  tx?: Transaction
) {
  await writeDoc(
    db.collection("vendor_payments").doc(paymentId),
    { ...updates, updatedAt: Timestamp.now() },
    { merge: true, tx }
  );
}
