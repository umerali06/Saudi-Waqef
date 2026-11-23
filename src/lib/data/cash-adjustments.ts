import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc } from "@/lib/firebase/documents";
import { normalizeSearch } from "@/lib/utils/search";

export type CashAdjustmentType = "increase" | "decrease";

export type CashAdjustment = {
  id: string;
  companyId: string;
  adjustmentNumber: string;
  adjustmentDate: string;
  accountId: string;
  offsetAccountId: string;
  type: CashAdjustmentType;
  amount: number;
  reason?: string | null;
  memo?: string | null;
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapCashAdjustment(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    adjustmentNumber: data.adjustmentNumber,
    adjustmentDate: data.adjustmentDate,
    accountId: data.accountId,
    offsetAccountId: data.offsetAccountId,
    type: data.type ?? "increase",
    amount: data.amount ?? 0,
    reason: data.reason ?? null,
    memo: data.memo ?? null,
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as CashAdjustment;
}

export async function listCashAdjustments(companyId: string) {
  const snapshot = await db
    .collection("cash_adjustments")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapCashAdjustment);
}

export async function getCashAdjustmentById(adjustmentId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("cash_adjustments").doc(adjustmentId), tx);
  return doc.exists ? mapCashAdjustment(doc) : null;
}

export async function createCashAdjustment(params: {
  id?: string;
  companyId: string;
  adjustmentDate: string;
  accountId: string;
  offsetAccountId: string;
  type: CashAdjustmentType;
  amount: number;
  reason?: string | null;
  memo?: string | null;
  journalEntryId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const adjustmentRef = db.collection("cash_adjustments").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "adjustment",
      defaultPrefix: "ADJ-",
      collection: "cash_adjustments",
      field: "adjustmentNumber",
      date: params.adjustmentDate,
    });
    const adjustmentNumber = sequence.number;

    transaction.set(adjustmentRef, {
      companyId: params.companyId,
      adjustmentNumber,
      adjustmentNumberNormalized: normalizeSearch(adjustmentNumber),
      adjustmentDate: params.adjustmentDate,
      accountId: params.accountId,
      offsetAccountId: params.offsetAccountId,
      type: params.type,
      amount: params.amount,
      reason: params.reason ?? null,
      memo: params.memo ?? null,
      journalEntryId: params.journalEntryId ?? null,
      createdAt: Timestamp.now(),
    });

    sequence.save();
    return adjustmentNumber;
  };

  const adjustmentNumber = tx ? await create(tx) : await db.runTransaction(create);
  return { id, adjustmentNumber };
}
