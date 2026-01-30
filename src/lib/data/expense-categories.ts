import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type ExpenseCategoryStatus = "active" | "inactive";

export type ExpenseCategory = {
  id: string;
  companyId: string;
  name: string;
  expenseAccountId: string;
  status: ExpenseCategoryStatus;
  createdAt: Date;
};

export async function listExpenseCategories(companyId: string) {
  const snapshot = await db
    .collection("expense_categories")
    .where("companyId", "==", companyId)
    .get();

  const categories = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name,
      expenseAccountId: data.expenseAccountId,
      status: data.status ?? "active",
      createdAt: data.createdAt.toDate(),
    } as ExpenseCategory;
  });

  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getExpenseCategoryById(categoryId: string) {
  const doc = await db.collection("expense_categories").doc(categoryId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name,
    expenseAccountId: data.expenseAccountId,
    status: data.status ?? "active",
    createdAt: data.createdAt.toDate(),
  } as ExpenseCategory;
}

export async function createExpenseCategory(params: {
  companyId: string;
  name: string;
  expenseAccountId: string;
  status?: ExpenseCategoryStatus;
}) {
  const id = uuidv4();
  await db.collection("expense_categories").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    nameNormalized: normalizeSearch(params.name),
    expenseAccountId: params.expenseAccountId,
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateExpenseCategory(
  categoryId: string,
  updates: Partial<{
    name: string;
    expenseAccountId: string;
    status: ExpenseCategoryStatus;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (typeof updates.name === "string") {
    payload.nameNormalized = normalizeSearch(updates.name);
  }
  await db.collection("expense_categories").doc(categoryId).set(payload, {
    merge: true,
  });
}
