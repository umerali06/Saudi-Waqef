import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type StatementLineStatus = "unmatched" | "matched" | "ignored";

export type StatementLine = {
  id: string;
  companyId: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  status: StatementLineStatus;
  matchedCashTransactionId?: string | null;
  createdAt: Date;
};

export async function listStatementLines(companyId: string, accountId: string) {
  const snapshot = await db
    .collection("bank_statement_lines")
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
      description: data.description ?? "",
      amount: data.amount ?? 0,
      status: data.status ?? "unmatched",
      matchedCashTransactionId: data.matchedCashTransactionId ?? null,
      createdAt: data.createdAt.toDate(),
    } as StatementLine;
  });
}

export async function getStatementLineById(lineId: string) {
  const doc = await db.collection("bank_statement_lines").doc(lineId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    accountId: data.accountId,
    date: data.date,
    description: data.description ?? "",
    amount: data.amount ?? 0,
    status: data.status ?? "unmatched",
    matchedCashTransactionId: data.matchedCashTransactionId ?? null,
    createdAt: data.createdAt.toDate(),
  } as StatementLine;
}

export async function createStatementLines(params: {
  companyId: string;
  accountId: string;
  lines: Array<{
    date: string;
    description: string;
    amount: number;
  }>;
}) {
  const batch = db.batch();
  const ids: string[] = [];
  params.lines.forEach((line) => {
    const id = uuidv4();
    ids.push(id);
    batch.set(db.collection("bank_statement_lines").doc(id), {
      companyId: params.companyId,
      accountId: params.accountId,
      date: line.date,
      description: line.description,
      amount: line.amount,
      status: "unmatched",
      matchedCashTransactionId: null,
      createdAt: Timestamp.now(),
    });
  });
  await batch.commit();
  return ids;
}

export async function updateStatementLine(
  lineId: string,
  updates: Partial<{
    status: StatementLineStatus;
    matchedCashTransactionId: string | null;
  }>
) {
  await db.collection("bank_statement_lines").doc(lineId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
