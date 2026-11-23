import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { createJournalEntry, deleteJournalEntry } from "@/lib/data/journal-entries";
import { OPENING_BALANCE_SOURCE } from "@/lib/utils/financial-statements";
import { roundMoney } from "@/lib/utils/invoice";

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

/** The single journal entry that carries a company's opening balances. */
export const openingEntryId = (companyId: string) => `opening_${companyId}`;

/** Replaces the opening balances together with the journal entry that posts them. */
export async function saveOpeningBalances(
  companyId: string,
  entries: OpeningBalance[],
  asOfDate: string,
  userId: string
) {
  const lines = entries
    .map((entry) => ({
      accountId: entry.accountId,
      debit: roundMoney(entry.debit),
      credit: roundMoney(entry.credit),
    }))
    .filter((line) => line.debit !== 0 || line.credit !== 0);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(
      db.collection("opening_balances").where("companyId", "==", companyId)
    );
    existing.docs.forEach((doc) => tx.delete(doc.ref));

    entries.forEach((entry) => {
      tx.set(db.collection("opening_balances").doc(), {
        companyId,
        accountId: entry.accountId,
        debit: entry.debit,
        credit: entry.credit,
        asOfDate,
        updatedAt: Timestamp.now(),
      });
    });

    if (lines.length === 0) {
      await deleteJournalEntry(openingEntryId(companyId), tx);
      return;
    }
    await createJournalEntry(
      {
        id: openingEntryId(companyId),
        companyId,
        sourceType: OPENING_BALANCE_SOURCE,
        date: asOfDate,
        memo: "Opening balances",
        lines,
        createdBy: userId,
        approvedBy: userId,
      },
      tx
    );
  });
}
