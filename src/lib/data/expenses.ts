import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";
import { buildSequenceNumber } from "@/lib/utils/numbering";

export type ExpenseStatus = "draft" | "approved";
export type ReimbursementStatus = "pending" | "paid";

export type Expense = {
  id: string;
  companyId: string;
  expenseNumber: string;
  status: ExpenseStatus;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  expenseAccountId: string;
  vendorId?: string | null;
  vendorName?: string | null;
  paymentMethod: string;
  paymentAccountId?: string | null;
  currency: string;
  amount: number;
  netAmount: number;
  taxAmount: number;
  taxRate: number;
  taxCategoryId?: string | null;
  taxInclusive: boolean;
  description?: string | null;
  notes?: string | null;
  reimbursable: boolean;
  reimbursementStatus?: ReimbursementStatus | null;
  reimburseTo?: string | null;
  journalEntryId?: string | null;
  reimbursementEntryId?: string | null;
  reimbursementMethod?: string | null;
  reimbursementAccountId?: string | null;
  reimbursementReference?: string | null;
  approvedAt?: string | null;
  reimbursedAt?: string | null;
  createdAt: Date;
};

const DEFAULT_CONFIG = {
  expensePrefix: "EXP-",
  expenseSuffix: "",
  expenseNextNumber: 1,
  expensePadding: 0,
  expenseResetYearly: false,
  expenseLastResetYear: null as number | null,
};

export async function listExpenses(companyId: string) {
  const snapshot = await db
    .collection("expenses")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      expenseNumber: data.expenseNumber,
      status: data.status ?? "draft",
      expenseDate: data.expenseDate,
      categoryId: data.categoryId,
      categoryName: data.categoryName,
      expenseAccountId: data.expenseAccountId,
      vendorId: data.vendorId ?? null,
      vendorName: data.vendorName ?? null,
      paymentMethod: data.paymentMethod ?? "cash",
      paymentAccountId: data.paymentAccountId ?? null,
      currency: data.currency ?? "SAR",
      amount: data.amount ?? 0,
      netAmount: data.netAmount ?? 0,
      taxAmount: data.taxAmount ?? 0,
      taxRate: data.taxRate ?? 0,
      taxCategoryId: data.taxCategoryId ?? null,
      taxInclusive: Boolean(data.taxInclusive),
      description: data.description ?? null,
      notes: data.notes ?? null,
      reimbursable: Boolean(data.reimbursable),
      reimbursementStatus: data.reimbursementStatus ?? null,
      reimburseTo: data.reimburseTo ?? null,
      journalEntryId: data.journalEntryId ?? null,
      reimbursementEntryId: data.reimbursementEntryId ?? null,
      reimbursementMethod: data.reimbursementMethod ?? null,
      reimbursementAccountId: data.reimbursementAccountId ?? null,
      reimbursementReference: data.reimbursementReference ?? null,
      approvedAt: data.approvedAt ?? null,
      reimbursedAt: data.reimbursedAt ?? null,
      createdAt: data.createdAt.toDate(),
    } as Expense;
  });
}

export async function getExpenseById(expenseId: string) {
  const doc = await db.collection("expenses").doc(expenseId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    expenseNumber: data.expenseNumber,
    status: data.status ?? "draft",
    expenseDate: data.expenseDate,
    categoryId: data.categoryId,
    categoryName: data.categoryName,
    expenseAccountId: data.expenseAccountId,
    vendorId: data.vendorId ?? null,
    vendorName: data.vendorName ?? null,
    paymentMethod: data.paymentMethod ?? "cash",
    paymentAccountId: data.paymentAccountId ?? null,
    currency: data.currency ?? "SAR",
    amount: data.amount ?? 0,
    netAmount: data.netAmount ?? 0,
    taxAmount: data.taxAmount ?? 0,
    taxRate: data.taxRate ?? 0,
    taxCategoryId: data.taxCategoryId ?? null,
    taxInclusive: Boolean(data.taxInclusive),
    description: data.description ?? null,
    notes: data.notes ?? null,
    reimbursable: Boolean(data.reimbursable),
      reimbursementStatus: data.reimbursementStatus ?? null,
      reimburseTo: data.reimburseTo ?? null,
      journalEntryId: data.journalEntryId ?? null,
      reimbursementEntryId: data.reimbursementEntryId ?? null,
      reimbursementMethod: data.reimbursementMethod ?? null,
      reimbursementAccountId: data.reimbursementAccountId ?? null,
      reimbursementReference: data.reimbursementReference ?? null,
      approvedAt: data.approvedAt ?? null,
      reimbursedAt: data.reimbursedAt ?? null,
      createdAt: data.createdAt.toDate(),
  } as Expense;
}

export async function createExpense(params: {
  companyId: string;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  expenseAccountId: string;
  vendorId?: string | null;
  vendorName?: string | null;
  paymentMethod: string;
  paymentAccountId?: string | null;
  currency?: string | null;
  amount: number;
  netAmount: number;
  taxAmount: number;
  taxRate: number;
  taxCategoryId?: string | null;
  taxInclusive: boolean;
  description?: string | null;
  notes?: string | null;
  reimbursable?: boolean;
  reimbursementStatus?: ReimbursementStatus | null;
  reimburseTo?: string | null;
  status?: ExpenseStatus;
}) {
  const id = uuidv4();
  const configRef = db.collection("company_configs").doc(params.companyId);
  const expenseRef = db.collection("expenses").doc(id);

  let expenseNumber = "";

  await db.runTransaction(async (tx) => {
    const configSnap = await tx.get(configRef);
    const config = configSnap.exists ? configSnap.data() : {};
    const sequence = buildSequenceNumber({
      prefix:
        typeof config.expensePrefix === "string"
          ? config.expensePrefix
          : DEFAULT_CONFIG.expensePrefix,
      suffix:
        typeof config.expenseSuffix === "string"
          ? config.expenseSuffix
          : DEFAULT_CONFIG.expenseSuffix,
      nextNumber:
        typeof config.expenseNextNumber === "number"
          ? config.expenseNextNumber
          : DEFAULT_CONFIG.expenseNextNumber,
      padding:
        typeof config.expensePadding === "number"
          ? config.expensePadding
          : DEFAULT_CONFIG.expensePadding,
      resetYearly:
        typeof config.expenseResetYearly === "boolean"
          ? config.expenseResetYearly
          : DEFAULT_CONFIG.expenseResetYearly,
      lastResetYear:
        typeof config.expenseLastResetYear === "number"
          ? config.expenseLastResetYear
          : DEFAULT_CONFIG.expenseLastResetYear,
      date: params.expenseDate,
    });
    expenseNumber = sequence.number;

    tx.set(expenseRef, {
      companyId: params.companyId,
      expenseNumber,
      expenseNumberNormalized: normalizeSearch(expenseNumber),
      status: params.status ?? "draft",
      expenseDate: params.expenseDate,
      categoryId: params.categoryId,
      categoryName: params.categoryName,
      categoryNameNormalized: normalizeSearch(params.categoryName),
      expenseAccountId: params.expenseAccountId,
      vendorId: params.vendorId ?? null,
      vendorName: params.vendorName ?? null,
      vendorNameNormalized: params.vendorName
        ? normalizeSearch(params.vendorName)
        : null,
      paymentMethod: params.paymentMethod,
      paymentAccountId: params.paymentAccountId ?? null,
      currency: params.currency ?? "SAR",
      amount: params.amount,
      netAmount: params.netAmount,
      taxAmount: params.taxAmount,
      taxRate: params.taxRate,
      taxCategoryId: params.taxCategoryId ?? null,
      taxInclusive: params.taxInclusive,
      description: params.description ?? null,
      notes: params.notes ?? null,
      reimbursable: Boolean(params.reimbursable),
      reimbursementStatus: params.reimbursementStatus ?? null,
      reimburseTo: params.reimburseTo ?? null,
      createdAt: Timestamp.now(),
    });

    tx.set(
      configRef,
      {
        expenseNextNumber: sequence.nextNumber,
        expenseLastResetYear: sequence.resetYear ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });

  return { id, expenseNumber };
}

export async function updateExpense(
  expenseId: string,
  updates: Partial<{
    status: ExpenseStatus;
    expenseDate: string;
    categoryId: string;
    categoryName: string;
    expenseAccountId: string;
    vendorId: string | null;
    vendorName: string | null;
    paymentMethod: string;
    paymentAccountId: string | null;
    currency: string;
    amount: number;
    netAmount: number;
    taxAmount: number;
    taxRate: number;
    taxCategoryId: string | null;
    taxInclusive: boolean;
    description: string | null;
    notes: string | null;
    reimbursable: boolean;
    reimbursementStatus: ReimbursementStatus | null;
    reimburseTo: string | null;
    journalEntryId: string | null;
    reimbursementEntryId: string | null;
    approvedAt: string | null;
    reimbursedAt: string | null;
    reimbursementMethod: string | null;
    reimbursementAccountId: string | null;
    reimbursementReference: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (typeof updates.vendorName === "string") {
    payload.vendorNameNormalized = normalizeSearch(updates.vendorName);
  }
  if (typeof updates.categoryName === "string") {
    payload.categoryNameNormalized = normalizeSearch(updates.categoryName);
  }
  if (typeof updates.reimburseTo === "string") {
    payload.reimburseToNormalized = normalizeSearch(updates.reimburseTo);
  }
  await db.collection("expenses").doc(expenseId).set(payload, { merge: true });
}
