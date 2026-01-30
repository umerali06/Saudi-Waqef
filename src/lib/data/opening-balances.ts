import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type OpeningBalance = {
  accountId: string;
  debit: number;
  credit: number;
  asOfDate?: string | null;
};

export async function listOpeningBalances(companyId: string) {
  const snapshot = await db
    .collection("opening_balances")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      accountId: data.accountId,
      debit: data.debit ?? 0,
      credit: data.credit ?? 0,
      asOfDate: data.asOfDate ?? null,
    } as OpeningBalance;
  });
}

export async function saveOpeningBalances(
  companyId: string,
  entries: OpeningBalance[],
  asOfDate?: string
) {
  const batch = db.batch();

  const existingSnapshot = await db
    .collection("opening_balances")
    .where("companyId", "==", companyId)
    .get();

  existingSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  entries.forEach((entry) => {
    const ref = db.collection("opening_balances").doc();
    batch.set(ref, {
      companyId,
      accountId: entry.accountId,
      debit: entry.debit,
      credit: entry.credit,
      asOfDate: asOfDate ?? null,
      updatedAt: Timestamp.now(),
    });
  });

  await batch.commit();
}
