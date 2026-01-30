import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

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

export async function listJournalEntries(companyId: string) {
  const snapshot = await db
    .collection("journal_entries")
    .where("companyId", "==", companyId)
    .get();

  const entries = snapshot.docs.map((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const approvedAt = data.approvedAt?.toDate ? data.approvedAt.toDate() : null;
    const reversedAt = data.reversedAt?.toDate ? data.reversedAt.toDate() : null;
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
      approvedAt,
      reversalOf: data.reversalOf ?? null,
      reversedBy: data.reversedBy ?? null,
      reversedAt,
      isAdjusting: Boolean(data.isAdjusting),
      createdAt,
    } as JournalEntry;
  });

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export async function createJournalEntry(params: {
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
}) {
  const id = uuidv4();
  const totalDebit = params.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = params.lines.reduce((sum, line) => sum + line.credit, 0);
  const status: JournalEntryStatus = params.status ?? "posted";
  const approvedAt =
    params.approvedAt ??
    (status === "posted" && params.approvedBy ? new Date() : null);
  await db.collection("journal_entries").doc(id).set({
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
  });
  return id;
}

export async function getJournalEntry(entryId: string) {
  const doc = await db.collection("journal_entries").doc(entryId).get();
  if (!doc.exists) {
    return null;
  }
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
  }>
) {
  await db.collection("journal_entries").doc(entryId).set(
    {
      ...updates,
      approvedAt: updates.approvedAt ? Timestamp.fromDate(updates.approvedAt) : undefined,
      reversedAt: updates.reversedAt ? Timestamp.fromDate(updates.reversedAt) : undefined,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function deleteJournalEntry(entryId: string) {
  await db.collection("journal_entries").doc(entryId).delete();
}
