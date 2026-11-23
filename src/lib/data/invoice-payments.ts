import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

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

function mapInvoicePayment(doc: DocumentSnapshot) {
  const data = doc.data()!;
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
}

export async function getInvoicePayment(id: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("invoice_payments").doc(id), tx);
  return doc.exists ? mapInvoicePayment(doc) : null;
}

export async function listInvoicePayments(invoiceId: string) {
  const snapshot = await db
    .collection("invoice_payments")
    .where("invoiceId", "==", invoiceId)
    .get();

  return snapshot.docs.map(mapInvoicePayment);
}

export async function listInvoicePaymentsByCompany(companyId: string) {
  const snapshot = await db
    .collection("invoice_payments")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapInvoicePayment);
}

export async function createInvoicePayment(params: {
  id?: string;
  companyId: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference?: string | null;
  accountId: string;
  journalEntryId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  await writeDoc(
    db.collection("invoice_payments").doc(id),
    {
      companyId: params.companyId,
      invoiceId: params.invoiceId,
      paymentDate: params.paymentDate,
      amount: params.amount,
      method: params.method,
      reference: params.reference ?? null,
      accountId: params.accountId,
      journalEntryId: params.journalEntryId ?? null,
      createdAt: Timestamp.now(),
    },
    { tx }
  );
  return id;
}
