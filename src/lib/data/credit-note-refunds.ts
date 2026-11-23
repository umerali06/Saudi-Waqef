import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type CreditNoteRefund = {
  id: string;
  companyId: string;
  creditNoteId: string;
  refundDate: string;
  amount: number;
  accountId: string;
  reference?: string | null;
  journalEntryId?: string | null;
  createdAt: Date;
};

export async function listCreditNoteRefundsByCompany(companyId: string) {
  const snapshot = await db
    .collection("credit_note_refunds")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapCreditNoteRefund);
}

export async function createCreditNoteRefund(params: {
  id?: string;
  companyId: string;
  creditNoteId: string;
  refundDate: string;
  amount: number;
  accountId: string;
  reference?: string | null;
  journalEntryId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  await writeDoc(
    db.collection("credit_note_refunds").doc(id),
    {
      companyId: params.companyId,
      creditNoteId: params.creditNoteId,
      refundDate: params.refundDate,
      amount: params.amount,
      accountId: params.accountId,
      reference: params.reference ?? null,
      journalEntryId: params.journalEntryId ?? null,
      createdAt: Timestamp.now(),
    },
    { tx }
  );
  return id;
}

function mapCreditNoteRefund(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    creditNoteId: data.creditNoteId,
    refundDate: data.refundDate,
    amount: data.amount ?? 0,
    accountId: data.accountId,
    reference: data.reference ?? null,
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as CreditNoteRefund;
}

export async function getCreditNoteRefund(id: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("credit_note_refunds").doc(id), tx);
  return doc.exists ? mapCreditNoteRefund(doc) : null;
}

export async function listCreditNoteRefunds(creditNoteId: string) {
  const snapshot = await db
    .collection("credit_note_refunds")
    .where("creditNoteId", "==", creditNoteId)
    .get();

  return snapshot.docs.map(mapCreditNoteRefund);
}
