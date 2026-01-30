import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { buildSequenceNumber } from "@/lib/utils/numbering";
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

const DEFAULT_CONFIG = {
  adjustmentPrefix: "ADJ-",
  adjustmentSuffix: "",
  adjustmentNextNumber: 1,
  adjustmentPadding: 0,
  adjustmentResetYearly: false,
  adjustmentLastResetYear: null as number | null,
};

export async function listCashAdjustments(companyId: string) {
  const snapshot = await db
    .collection("cash_adjustments")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
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
  });
}

export async function getCashAdjustmentById(adjustmentId: string) {
  const doc = await db.collection("cash_adjustments").doc(adjustmentId).get();
  if (!doc.exists) {
    return null;
  }
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

export async function createCashAdjustment(params: {
  companyId: string;
  adjustmentDate: string;
  accountId: string;
  offsetAccountId: string;
  type: CashAdjustmentType;
  amount: number;
  reason?: string | null;
  memo?: string | null;
  journalEntryId?: string | null;
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const adjustmentRef = db.collection("cash_adjustments").doc(id);

  let adjustmentNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.exists ? configSnap.data() : {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.adjustmentPrefix === "string"
          ? config.adjustmentPrefix
          : DEFAULT_CONFIG.adjustmentPrefix,
      suffix:
        typeof config.adjustmentSuffix === "string"
          ? config.adjustmentSuffix
          : DEFAULT_CONFIG.adjustmentSuffix,
      nextNumber:
        typeof config.adjustmentNextNumber === "number"
          ? config.adjustmentNextNumber
          : DEFAULT_CONFIG.adjustmentNextNumber,
      padding:
        typeof config.adjustmentPadding === "number"
          ? config.adjustmentPadding
          : DEFAULT_CONFIG.adjustmentPadding,
      resetYearly:
        typeof config.adjustmentResetYearly === "boolean"
          ? config.adjustmentResetYearly
          : DEFAULT_CONFIG.adjustmentResetYearly,
      lastResetYear:
        typeof config.adjustmentLastResetYear === "number"
          ? config.adjustmentLastResetYear
          : DEFAULT_CONFIG.adjustmentLastResetYear,
      date: params.adjustmentDate,
    });
    adjustmentNumber = sequence.number;

    tx.set(adjustmentRef, {
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

    tx.set(
      configRef,
      {
        adjustmentNextNumber: sequence.nextNumber,
        adjustmentLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

  return { id, adjustmentNumber };
}
