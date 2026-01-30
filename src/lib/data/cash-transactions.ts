import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type CashDirection = "in" | "out";

export type CashTransaction = {
  id: string;
  companyId: string;
  accountId: string;
  date: string;
  amount: number;
  direction: CashDirection;
  reference?: string | null;
  description?: string | null;
  sourceType: string;
  sourceId?: string | null;
  createdAt: Date;
};

export async function listCashTransactions(companyId: string, accountId: string) {
  const snapshot = await db
    .collection("cash_transactions")
    .where("companyId", "==", companyId)
    .where("accountId", "==", accountId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      accountId: data.accountId,
      date: data.date,
      amount: data.amount ?? 0,
      direction: data.direction ?? "in",
      reference: data.reference ?? null,
      description: data.description ?? null,
      sourceType: data.sourceType,
      sourceId: data.sourceId ?? null,
      createdAt: data.createdAt.toDate(),
    } as CashTransaction;
  });
}

export async function createCashTransaction(params: {
  companyId: string;
  accountId: string;
  date: string;
  amount: number;
  direction: CashDirection;
  reference?: string | null;
  description?: string | null;
  sourceType: string;
  sourceId?: string | null;
}) {
  const id = uuidv4();
  await db.collection("cash_transactions").doc(id).set({
    companyId: params.companyId,
    accountId: params.accountId,
    date: params.date,
    amount: params.amount,
    direction: params.direction,
    reference: params.reference ?? null,
    description: params.description ?? null,
    sourceType: params.sourceType,
    sourceId: params.sourceId ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
