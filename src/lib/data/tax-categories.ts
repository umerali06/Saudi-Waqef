import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getCache, invalidateCache, setCache } from "@/lib/utils/cache";

export type TaxCategory = {
  id: string;
  companyId: string;
  name: string;
  rate: number;
  type: "standard" | "zero" | "exempt";
  status: "active" | "inactive";
  createdAt: Date;
};

export async function listTaxCategories(companyId: string) {
  const cacheKey = `tax_categories:${companyId}`;
  const cached = getCache<TaxCategory[]>(cacheKey);
  if (cached) {
    return cached;
  }
  const snapshot = await db
    .collection("tax_categories")
    .where("companyId", "==", companyId)
    .get();

  const categories = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name,
      rate: data.rate,
      type: data.type,
      status: data.status ?? "active",
      createdAt: data.createdAt.toDate(),
    } as TaxCategory;
  });

  return setCache(
    cacheKey,
    categories.sort((a, b) => a.name.localeCompare(b.name))
  );
}

export async function createTaxCategory(params: {
  companyId: string;
  name: string;
  rate: number;
  type: TaxCategory["type"];
  status?: TaxCategory["status"];
}) {
  const id = uuidv4();
  await db.collection("tax_categories").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    rate: params.rate,
    type: params.type,
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });
  invalidateCache(`tax_categories:${params.companyId}`);
  return id;
}

export async function getTaxCategory(categoryId: string) {
  const doc = await db.collection("tax_categories").doc(categoryId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name,
    rate: data.rate,
    type: data.type,
    status: data.status ?? "active",
    createdAt: data.createdAt.toDate(),
  } as TaxCategory;
}

export async function updateTaxCategory(
  categoryId: string,
  updates: Partial<Pick<TaxCategory, "name" | "rate" | "type" | "status">>
) {
  await db.collection("tax_categories").doc(categoryId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  const updated = await getTaxCategory(categoryId);
  if (updated?.companyId) {
    invalidateCache(`tax_categories:${updated.companyId}`);
  }
}
