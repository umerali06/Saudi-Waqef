import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { readDoc, writeDoc } from "@/lib/firebase/documents";
import { isBalanced } from "@/lib/utils/journal";
import { roundMoney } from "@/lib/utils/invoice";

export type JournalLine = {
  accountId: string;
  debit: number;
  credit: number;
};

export type JournalEntryStatus = "posted" | "draft" | "void";

export type JournalEntry = {
  id: string;
  companyId: string;
  sourceType: string;
  sourceId?: string | null;
  date: string;
  memo?: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: JournalEntryStatus;
  createdBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  reversalOf?: string | null;
  reversedBy?: string | null;
  reversedAt?: Date | null;
  isAdjusting?: boolean;
  createdAt: Date;
};

function mapJournalEntry(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    sourceType: data.sourceType,
    sourceId: data.sourceId ?? null,
    date: data.date,
    memo: data.memo ?? "",
    lines: data.lines ?? [],
    totalDebit: data.totalDebit ?? 0,
    totalCredit: data.totalCredit ?? 0,
    status: (data.status ?? "posted") as JournalEntryStatus,
    createdBy: data.createdBy ?? null,
    approvedBy: data.approvedBy ?? null,
    approvedAt: data.approvedAt?.toDate ? data.approvedAt.toDate() : null,
    reversalOf: data.reversalOf ?? null,
    reversedBy: data.reversedBy ?? null,
    reversedAt: data.reversedAt?.toDate ? data.reversedAt.toDate() : null,
    isAdjusting: Boolean(data.isAdjusting),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as JournalEntry;
}

export async function listJournalEntries(companyId: string) {
  const snapshot = await db
    .collection("journal_entries")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapJournalEntry).sort((a, b) => a.date.localeCompare(b.date));
}

export async function createJournalEntry(params: {
  id?: string;
  companyId: string;
  sourceType: string;
  sourceId?: string | null;
  date: string;
  memo?: string | null;
  lines: JournalLine[];
  status?: JournalEntryStatus;
  createdBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  reversalOf?: string | null;
  reversedBy?: string | null;
  reversedAt?: Date | null;
  isAdjusting?: boolean;
}, tx?: Transaction) {
  if (!isBalanced(params.lines)) {
    throw new Error(
      `Unbalanced journal entry: ${params.sourceType} ${params.sourceId ?? ""}`.trim()
    );
  }
  const id = params.id ?? uuidv4();
  const totalDebit = roundMoney(params.lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundMoney(params.lines.reduce((sum, line) => sum + line.credit, 0));
  const status: JournalEntryStatus = params.status ?? "posted";
  const approvedAt =
    params.approvedAt ??
    (status === "posted" && params.approvedBy ? new Date() : null);
  await writeDoc(
    db.collection("journal_entries").doc(id),
    {
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      date: params.date,
      memo: params.memo ?? null,
      lines: params.lines,
      totalDebit,
      totalCredit,
      status,
      createdBy: params.createdBy ?? null,
      approvedBy: params.approvedBy ?? null,
      approvedAt: approvedAt ? Timestamp.fromDate(approvedAt) : null,
      reversalOf: params.reversalOf ?? null,
      reversedBy: params.reversedBy ?? null,
      reversedAt: params.reversedAt ? Timestamp.fromDate(params.reversedAt) : null,
      isAdjusting: Boolean(params.isAdjusting),
      createdAt: Timestamp.now(),
    },
    { tx }
  );
  return id;
}

export async function getJournalEntry(entryId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("journal_entries").doc(entryId), tx);
  return doc.exists ? mapJournalEntry(doc) : null;
}

export async function updateJournalEntry(
  entryId: string,
  updates: Partial<{
    date: string;
    memo: string | null;
    lines: JournalLine[];
    totalDebit: number;
    totalCredit: number;
    status: JournalEntryStatus;
    approvedBy: string | null;
    approvedAt: Date | null;
    reversedBy: string | null;
    reversedAt: Date | null;
    isAdjusting: boolean;
  }>,
  tx?: Transaction
) {
  const { approvedAt, reversedAt, ...rest } = updates;
  const payload: Record<string, unknown> = { ...rest, updatedAt: Timestamp.now() };
  if (approvedAt !== undefined) {
    payload.approvedAt = approvedAt ? Timestamp.fromDate(approvedAt) : null;
  }
  if (reversedAt !== undefined) {
    payload.reversedAt = reversedAt ? Timestamp.fromDate(reversedAt) : null;
  }
  await writeDoc(db.collection("journal_entries").doc(entryId), payload, { merge: true, tx });
}

export async function deleteJournalEntry(entryId: string, tx?: Transaction) {
  const ref = db.collection("journal_entries").doc(entryId);
  if (tx) {
    tx.delete(ref);
    return;
  }
  await ref.delete();
}
