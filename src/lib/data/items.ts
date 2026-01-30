import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type ItemType = "product" | "service";
export type ItemStatus = "active" | "inactive";

export type ItemRecord = {
  id: string;
  companyId: string;
  type: ItemType;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
  salePrice?: number | null;
  purchasePrice?: number | null;
  taxCategoryId?: string | null;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  trackInventory: boolean;
  minStock?: number | null;
  stockOnHand: number;
  stockReserved: number;
  status: ItemStatus;
  tags: string[];
  createdAt: Date;
};

export async function listItems(companyId: string) {
  const snapshot = await db
    .collection("items")
    .where("companyId", "==", companyId)
    .get();

  const items = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      type: data.type,
      name: data.name,
      sku: data.sku ?? undefined,
      barcode: data.barcode ?? undefined,
      category: data.category ?? undefined,
      brand: data.brand ?? undefined,
      descriptionAr: data.descriptionAr ?? undefined,
      descriptionEn: data.descriptionEn ?? undefined,
      baseUnit: data.baseUnit,
      packUnit: data.packUnit ?? null,
      packSize: data.packSize ?? null,
      salePrice: data.salePrice ?? null,
      purchasePrice: data.purchasePrice ?? null,
      taxCategoryId: data.taxCategoryId ?? null,
      incomeAccountId: data.incomeAccountId ?? null,
      expenseAccountId: data.expenseAccountId ?? null,
      trackInventory: Boolean(data.trackInventory),
      minStock: data.minStock ?? null,
      stockOnHand: data.stockOnHand ?? 0,
      stockReserved: data.stockReserved ?? 0,
      status: data.status ?? "active",
      tags: data.tags ?? [],
      createdAt: data.createdAt.toDate(),
    } as ItemRecord;
  });

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getItemById(itemId: string) {
  const doc = await db.collection("items").doc(itemId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    type: data.type,
    name: data.name,
    sku: data.sku ?? undefined,
    barcode: data.barcode ?? undefined,
    category: data.category ?? undefined,
    brand: data.brand ?? undefined,
    descriptionAr: data.descriptionAr ?? undefined,
    descriptionEn: data.descriptionEn ?? undefined,
    baseUnit: data.baseUnit,
    packUnit: data.packUnit ?? null,
    packSize: data.packSize ?? null,
    salePrice: data.salePrice ?? null,
    purchasePrice: data.purchasePrice ?? null,
    taxCategoryId: data.taxCategoryId ?? null,
    incomeAccountId: data.incomeAccountId ?? null,
    expenseAccountId: data.expenseAccountId ?? null,
    trackInventory: Boolean(data.trackInventory),
    minStock: data.minStock ?? null,
    stockOnHand: data.stockOnHand ?? 0,
    stockReserved: data.stockReserved ?? 0,
    status: data.status ?? "active",
    tags: data.tags ?? [],
    createdAt: data.createdAt.toDate(),
  } as ItemRecord;
}

export async function createItem(params: {
  companyId: string;
  type: ItemType;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  brand?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
  salePrice?: number | null;
  purchasePrice?: number | null;
  taxCategoryId?: string | null;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  trackInventory?: boolean;
  minStock?: number | null;
  status?: ItemStatus;
  tags?: string[];
}) {
  const id = uuidv4();
  const normalizedName = normalizeSearch(params.name);
  await db.collection("items").doc(id).set({
    companyId: params.companyId,
    type: params.type,
    name: params.name.trim(),
    nameNormalized: normalizedName,
    sku: params.sku ?? null,
    barcode: params.barcode ?? null,
    category: params.category ?? null,
    brand: params.brand ?? null,
    descriptionAr: params.descriptionAr ?? null,
    descriptionEn: params.descriptionEn ?? null,
    baseUnit: params.baseUnit,
    packUnit: params.packUnit ?? null,
    packSize: params.packSize ?? null,
    salePrice: params.salePrice ?? null,
    purchasePrice: params.purchasePrice ?? null,
    taxCategoryId: params.taxCategoryId ?? null,
    incomeAccountId: params.incomeAccountId ?? null,
    expenseAccountId: params.expenseAccountId ?? null,
    trackInventory: params.trackInventory ?? false,
    minStock: params.minStock ?? null,
    stockOnHand: 0,
    stockReserved: 0,
    status: params.status ?? "active",
    tags: params.tags ?? [],
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateItem(
  itemId: string,
  updates: Partial<{
    type: ItemType;
    name: string;
    sku: string | null;
    barcode: string | null;
    category: string | null;
    brand: string | null;
    descriptionAr: string | null;
    descriptionEn: string | null;
    baseUnit: string;
    packUnit: string | null;
    packSize: number | null;
    salePrice: number | null;
    purchasePrice: number | null;
    taxCategoryId: string | null;
    incomeAccountId: string | null;
    expenseAccountId: string | null;
    trackInventory: boolean;
    minStock: number | null;
    status: ItemStatus;
    tags: string[];
    stockOnHand: number;
    stockReserved: number;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.name) {
    payload.nameNormalized = normalizeSearch(updates.name);
  }
  await db.collection("items").doc(itemId).set(payload, { merge: true });
}

export async function bulkUpdateItems(
  itemIds: string[],
  updates: Partial<Pick<ItemRecord, "status">>
) {
  const batch = db.batch();
  const updatePayload = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  itemIds.forEach((id) => {
    batch.set(db.collection("items").doc(id), updatePayload, { merge: true });
  });
  await batch.commit();
}

export async function applyItemStockDeltas(
  updates: Array<{
    itemId: string;
    stockReservedDelta?: number;
    stockOnHandDelta?: number;
  }>
) {
  if (updates.length === 0) {
    return;
  }
  const batch = db.batch();
  updates.forEach((update) => {
    const payload: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };
    if (update.stockReservedDelta) {
      payload.stockReserved = FieldValue.increment(update.stockReservedDelta);
    }
    if (update.stockOnHandDelta) {
      payload.stockOnHand = FieldValue.increment(update.stockOnHandDelta);
    }
    batch.set(db.collection("items").doc(update.itemId), payload, { merge: true });
  });
  await batch.commit();
}
