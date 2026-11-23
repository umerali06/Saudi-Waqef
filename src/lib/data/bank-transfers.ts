import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { nextDocumentNumber } from "@/lib/data/numbering";
import { readDoc } from "@/lib/firebase/documents";
import { normalizeSearch } from "@/lib/utils/search";

export type BankTransfer = {
  id: string;
  companyId: string;
  transferNumber: string;
  transferDate: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reference?: string | null;
  memo?: string | null;
  journalEntryId?: string | null;
  createdAt: Date;
};

function mapBankTransfer(doc: DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    transferNumber: data.transferNumber,
    transferDate: data.transferDate,
    fromAccountId: data.fromAccountId,
    toAccountId: data.toAccountId,
    amount: data.amount ?? 0,
    reference: data.reference ?? null,
    memo: data.memo ?? null,
    journalEntryId: data.journalEntryId ?? null,
    createdAt: data.createdAt.toDate(),
  } as BankTransfer;
}

export async function listBankTransfers(companyId: string) {
  const snapshot = await db
    .collection("bank_transfers")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map(mapBankTransfer);
}

export async function getBankTransferById(transferId: string, tx?: Transaction) {
  const doc = await readDoc(db.collection("bank_transfers").doc(transferId), tx);
  return doc.exists ? mapBankTransfer(doc) : null;
}

export async function createBankTransfer(params: {
  id?: string;
  companyId: string;
  transferDate: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reference?: string | null;
  memo?: string | null;
  journalEntryId?: string | null;
}, tx?: Transaction) {
  const id = params.id ?? uuidv4();
  const transferRef = db.collection("bank_transfers").doc(id);

  const create = async (transaction: Transaction) => {
    const sequence = await nextDocumentNumber(transaction, {
      companyId: params.companyId,
      key: "transfer",
      defaultPrefix: "TRF-",
      collection: "bank_transfers",
      field: "transferNumber",
      date: params.transferDate,
    });
    const transferNumber = sequence.number;

    transaction.set(transferRef, {
      companyId: params.companyId,
      transferNumber,
      transferNumberNormalized: normalizeSearch(transferNumber),
      transferDate: params.transferDate,
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
      amount: params.amount,
      reference: params.reference ?? null,
      memo: params.memo ?? null,
      journalEntryId: params.journalEntryId ?? null,
      createdAt: Timestamp.now(),
    });

    sequence.save();
    return transferNumber;
  };

  const transferNumber = tx ? await create(tx) : await db.runTransaction(create);
  return { id, transferNumber };
}
