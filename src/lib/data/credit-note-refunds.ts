import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

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

export async function createCreditNoteRefund(params: {
  companyId: string;
  creditNoteId: string;
  refundDate: string;
  amount: number;
  accountId: string;
  reference?: string | null;
  journalEntryId?: string | null;
}) {
  const id = uuidv4();
  await db.collection("credit_note_refunds").doc(id).set({
    companyId: params.companyId,
    creditNoteId: params.creditNoteId,
    refundDate: params.refundDate,
    amount: params.amount,
    accountId: params.accountId,
    reference: params.reference ?? null,
    journalEntryId: params.journalEntryId ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function listCreditNoteRefunds(creditNoteId: string) {
  const snapshot = await db
    .collection("credit_note_refunds")
    .where("creditNoteId", "==", creditNoteId)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
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
  });
}
