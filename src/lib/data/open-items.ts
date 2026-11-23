import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { readDoc, writeDoc } from "@/lib/firebase/documents";

export type PartyType = "customer" | "vendor";

export type OpenItem = {
  id: string;
  companyId: string;
  partyType: PartyType;
  partyId: string;
  docType: string;
  docNumber: string;
  /** Receipt, vendor payment or credit note the credit came from. */
  sourceId?: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  balance: number;
  currency: string;
  createdAt: Date;
};

export type AgingSummary = {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
};

const buildPartyKey = (companyId: string, partyType: PartyType, partyId: string) =>
  `${companyId}:${partyType}:${partyId}`;

function mapOpenItem(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    partyType: data.partyType,
    partyId: data.partyId,
    docType: data.docType,
    docNumber: data.docNumber,
    sourceId: data.sourceId ?? null,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    amount: data.amount ?? 0,
    balance: data.balance ?? 0,
    currency: data.currency ?? "SAR",
    createdAt: data.createdAt.toDate(),
  } as OpenItem;
}

export async function getOpenItemById(openItemId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("open_items").doc(openItemId), tx);
  return doc.exists ? mapOpenItem(doc) : null;
}

export async function listOpenItems(companyId: string, partyType: PartyType, partyId: string) {
  const partyKey = buildPartyKey(companyId, partyType, partyId);
  const snapshot = await db
    .collection("open_items")
    .where("companyPartyKey", "==", partyKey)
    .get();

  return snapshot.docs.map(mapOpenItem);
}

export async function listOpenItemsByCompany(companyId: string) {
  const snapshot = await db
    .collection("open_items")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapOpenItem);
}

export function buildAgingByParty(items: OpenItem[]) {
  const map = new Map<string, { total: number; aging: AgingSummary; items: OpenItem[] }>();
  for (const item of items) {
    const key = item.partyId;
    if (!map.has(key)) {
      map.set(key, { total: 0, aging: computeAging([]), items: [] });
    }
    const entry = map.get(key)!;
    entry.items.push(item);
    entry.aging = computeAging(entry.items);
    entry.total = entry.aging.total;
  }
  return map;
}

export function computeAging(items: OpenItem[], asOfDate = new Date()) {
  const today = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));
  const summary: AgingSummary = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
    total: 0,
  };

  for (const item of items) {
    const due = new Date(`${item.dueDate}T00:00:00Z`);
    const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const amount = item.balance ?? 0;
    summary.total += amount;
    if (diffDays <= 0) {
      summary.current += amount;
    } else if (diffDays <= 30) {
      summary.days1to30 += amount;
    } else if (diffDays <= 60) {
      summary.days31to60 += amount;
    } else if (diffDays <= 90) {
      summary.days61to90 += amount;
    } else {
      summary.days90plus += amount;
    }
  }

  return summary;
}

export async function createOpenItem(params: {
  id?: string;
  companyId: string;
  partyType: PartyType;
  partyId: string;
  docType: string;
  docNumber: string;
  sourceId?: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  balance: number;
  currency?: string;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const companyPartyKey = buildPartyKey(params.companyId, params.partyType, params.partyId);
  await writeDoc(
    db.collection("open_items").doc(id),
    {
      companyId: params.companyId,
      partyType: params.partyType,
      partyId: params.partyId,
      companyPartyKey,
      docType: params.docType,
      docNumber: params.docNumber,
      sourceId: params.sourceId ?? null,
      issueDate: params.issueDate,
      dueDate: params.dueDate,
      amount: params.amount,
      balance: params.balance,
      currency: params.currency ?? "SAR",
      createdAt: Timestamp.now(),
    },
    { tx }
  );
  return id;
}

export async function updateOpenItemBalance(
  openItemId: string,
  balance: number,
  tx?: Transaction
) {
  await writeDoc(
    db.collection("open_items").doc(openItemId),
    { balance, updatedAt: Timestamp.now() },
    { merge: true, tx }
  );
}

export async function deleteOpenItem(openItemId: string, tx?: Transaction) {
  const ref = db.collection("open_items").doc(openItemId);
  if (tx) {
    tx.delete(ref);
    return;
  }
  await ref.delete();
}
