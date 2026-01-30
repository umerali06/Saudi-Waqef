import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { decryptOptional, encryptOptional } from "@/lib/security/crypto";

export type CashBankAccountType = "cash" | "bank";
export type CashBankAccountStatus = "active" | "inactive";

export type CashBankAccount = {
  id: string;
  companyId: string;
  accountId: string;
  name: string;
  type: CashBankAccountType;
  status: CashBankAccountStatus;
  openingBalance: number;
  bankName?: string | null;
  iban?: string | null;
  createdAt: Date;
};

export async function listCashBankAccounts(companyId: string) {
  const snapshot = await db
    .collection("cash_bank_accounts")
    .where("companyId", "==", companyId)
    .get();

  const accounts = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      accountId: data.accountId,
      name: data.name,
      type: data.type ?? "cash",
      status: data.status ?? "active",
      openingBalance: data.openingBalance ?? 0,
      bankName: data.bankName ?? null,
      iban: decryptOptional(data.iban ?? null),
      createdAt: data.createdAt.toDate(),
    } as CashBankAccount;
  });

  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCashBankAccountById(accountId: string) {
  const doc = await db.collection("cash_bank_accounts").doc(accountId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    accountId: data.accountId,
    name: data.name,
    type: data.type ?? "cash",
    status: data.status ?? "active",
    openingBalance: data.openingBalance ?? 0,
    bankName: data.bankName ?? null,
    iban: decryptOptional(data.iban ?? null),
    createdAt: data.createdAt.toDate(),
  } as CashBankAccount;
}

export async function createCashBankAccount(params: {
  companyId: string;
  accountId: string;
  name: string;
  type: CashBankAccountType;
  status?: CashBankAccountStatus;
  openingBalance?: number;
  bankName?: string | null;
  iban?: string | null;
}) {
  const id = uuidv4();
  await db.collection("cash_bank_accounts").doc(id).set({
    companyId: params.companyId,
    accountId: params.accountId,
    name: params.name.trim(),
    nameNormalized: normalizeSearch(params.name),
    type: params.type,
    status: params.status ?? "active",
    openingBalance: params.openingBalance ?? 0,
    bankName: params.bankName ?? null,
    iban: encryptOptional(params.iban ?? null),
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateCashBankAccount(
  accountId: string,
  updates: Partial<{
    name: string;
    accountId: string;
    type: CashBankAccountType;
    status: CashBankAccountStatus;
    openingBalance: number;
    bankName: string | null;
    iban: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (typeof updates.name === "string") {
    payload.nameNormalized = normalizeSearch(updates.name);
  }
  if (updates.iban !== undefined) {
    payload.iban = encryptOptional(updates.iban);
  }
  await db.collection("cash_bank_accounts").doc(accountId).set(payload, {
    merge: true,
  });
}
