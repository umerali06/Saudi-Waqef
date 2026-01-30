import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type BillingInvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "overdue"
  | "failed"
  | "void";

export type BillingInvoice = {
  id: string;
  companyId: string;
  subscriptionId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  status: BillingInvoiceStatus;
  periodStart: string;
  periodEnd: string;
  issuedAt?: Date | null;
  dueDate?: Date | null;
  paidAt?: Date | null;
  createdAt: Date;
};

export async function listBillingInvoices(companyId: string) {
  const snapshot = await db
    .collection("billing_invoices")
    .where("companyId", "==", companyId)
    .get();

  const invoices = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      subscriptionId: data.subscriptionId,
      planId: data.planId,
      planName: data.planName ?? "",
      amount: Number(data.amount ?? 0),
      currency: data.currency ?? "SAR",
      status: (data.status ?? "issued") as BillingInvoiceStatus,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      issuedAt: data.issuedAt?.toDate ? data.issuedAt.toDate() : null,
      dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : null,
      paidAt: data.paidAt?.toDate ? data.paidAt.toDate() : null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as BillingInvoice;
  });

  return invoices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getBillingInvoiceById(invoiceId: string) {
  const doc = await db.collection("billing_invoices").doc(invoiceId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    subscriptionId: data.subscriptionId,
    planId: data.planId,
    planName: data.planName ?? "",
    amount: Number(data.amount ?? 0),
    currency: data.currency ?? "SAR",
    status: (data.status ?? "issued") as BillingInvoiceStatus,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    issuedAt: data.issuedAt?.toDate ? data.issuedAt.toDate() : null,
    dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : null,
    paidAt: data.paidAt?.toDate ? data.paidAt.toDate() : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as BillingInvoice;
}

export async function createBillingInvoice(params: {
  companyId: string;
  subscriptionId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  status: BillingInvoiceStatus;
  periodStart: string;
  periodEnd: string;
  issuedAt?: Date | null;
  dueDate?: Date | null;
  paidAt?: Date | null;
}) {
  const id = uuidv4();
  await db.collection("billing_invoices").doc(id).set({
    companyId: params.companyId,
    subscriptionId: params.subscriptionId,
    planId: params.planId,
    planName: params.planName,
    amount: params.amount,
    currency: params.currency,
    status: params.status,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    issuedAt: params.issuedAt ? Timestamp.fromDate(params.issuedAt) : null,
    dueDate: params.dueDate ? Timestamp.fromDate(params.dueDate) : null,
    paidAt: params.paidAt ? Timestamp.fromDate(params.paidAt) : null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateBillingInvoice(
  invoiceId: string,
  updates: Partial<{
    status: BillingInvoiceStatus;
    issuedAt: Date | null;
    dueDate: Date | null;
    paidAt: Date | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.issuedAt !== undefined) {
    payload.issuedAt = updates.issuedAt ? Timestamp.fromDate(updates.issuedAt) : null;
  }
  if (updates.dueDate !== undefined) {
    payload.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
  }
  if (updates.paidAt !== undefined) {
    payload.paidAt = updates.paidAt ? Timestamp.fromDate(updates.paidAt) : null;
  }
  await db.collection("billing_invoices").doc(invoiceId).set(payload, { merge: true });
}
