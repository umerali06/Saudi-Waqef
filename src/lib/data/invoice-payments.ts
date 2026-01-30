import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type InvoicePayment = {
  id: string;
  companyId: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference?: string;
  accountId: string;
  journalEntryId?: string | null;
  createdAt: Date;
};

export async function listInvoicePayments(invoiceId: string) {
  const snapshot = await db
    .collection("invoice_payments")
    .where("invoiceId", "==", invoiceId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      invoiceId: data.invoiceId,
      paymentDate: data.paymentDate,
      amount: data.amount ?? 0,
      method: data.method,
      reference: data.reference ?? undefined,
      accountId: data.accountId,
      journalEntryId: data.journalEntryId ?? null,
      createdAt: data.createdAt.toDate(),
    } as InvoicePayment;
  });
}

export async function createInvoicePayment(params: {
  companyId: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference?: string | null;
  accountId: string;
  journalEntryId?: string | null;
}) {
  const id = uuidv4();
  await db.collection("invoice_payments").doc(id).set({
    companyId: params.companyId,
    invoiceId: params.invoiceId,
    paymentDate: params.paymentDate,
    amount: params.amount,
    method: params.method,
    reference: params.reference ?? null,
    accountId: params.accountId,
    journalEntryId: params.journalEntryId ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
