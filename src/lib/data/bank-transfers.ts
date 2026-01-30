import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { buildSequenceNumber } from "@/lib/utils/numbering";
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

const DEFAULT_CONFIG = {
  transferPrefix: "TRF-",
  transferSuffix: "",
  transferNextNumber: 1,
  transferPadding: 0,
  transferResetYearly: false,
  transferLastResetYear: null as number | null,
};

export async function listBankTransfers(companyId: string) {
  const snapshot = await db
    .collection("bank_transfers")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
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
  });
}

export async function getBankTransferById(transferId: string) {
  const doc = await db.collection("bank_transfers").doc(transferId).get();
  if (!doc.exists) {
    return null;
  }
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

export async function createBankTransfer(params: {
  companyId: string;
  transferDate: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reference?: string | null;
  memo?: string | null;
  journalEntryId?: string | null;
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const transferRef = db.collection("bank_transfers").doc(id);

  let transferNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.exists ? configSnap.data() : {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.transferPrefix === "string"
          ? config.transferPrefix
          : DEFAULT_CONFIG.transferPrefix,
      suffix:
        typeof config.transferSuffix === "string"
          ? config.transferSuffix
          : DEFAULT_CONFIG.transferSuffix,
      nextNumber:
        typeof config.transferNextNumber === "number"
          ? config.transferNextNumber
          : DEFAULT_CONFIG.transferNextNumber,
      padding:
        typeof config.transferPadding === "number"
          ? config.transferPadding
          : DEFAULT_CONFIG.transferPadding,
      resetYearly:
        typeof config.transferResetYearly === "boolean"
          ? config.transferResetYearly
          : DEFAULT_CONFIG.transferResetYearly,
      lastResetYear:
        typeof config.transferLastResetYear === "number"
          ? config.transferLastResetYear
          : DEFAULT_CONFIG.transferLastResetYear,
      date: params.transferDate,
    });
    transferNumber = sequence.number;

    tx.set(transferRef, {
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

    tx.set(
      configRef,
      {
        transferNextNumber: sequence.nextNumber,
        transferLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

  return { id, transferNumber };
}
