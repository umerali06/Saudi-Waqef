import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type BillPayment = {
  id: string;
  companyId: string;
  billId: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference?: string;
  accountId: string;
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapBillPayment(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    billId: data.billId,
    paymentDate: data.paymentDate,
    amount: data.amount ?? 0,
    method: data.method,
    reference: data.reference ?? undefined,
    accountId: data.accountId,
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as BillPayment;
}

export async function getBillPayment(id: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("bill_payments").doc(id), tx);
  return doc.exists ? mapBillPayment(doc) : null;
}

export async function listBillPayments(billId: string) {
  const snapshot = await db
    .collection("bill_payments")
    .where("billId", "==", billId)
    .get();

  return snapshot.docs.map(mapBillPayment);
}

export async function listBillPaymentsByCompany(companyId: string) {
  const snapshot = await db
    .collection("bill_payments")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapBillPayment);
}

export async function createBillPayment(params: {
  id?: string;
  companyId: string;
  billId: string;
  paymentDate: string;
  amount: number;
  method: string;
  reference?: string | null;
  accountId: string;
  journalEntryId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  await writeDoc(
    db.collection("bill_payments").doc(id),
    {
      companyId: params.companyId,
      billId: params.billId,
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
