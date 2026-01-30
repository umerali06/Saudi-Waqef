import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AdjustmentReason = "opening" | "damage" | "count" | "other";

export type InventoryAdjustment = {
  id: string;
  companyId: string;
  itemId: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  reason: AdjustmentReason;
  note?: string;
  createdAt: Date;
};

export async function listInventoryAdjustments(itemId: string) {
  const snapshot = await db
    .collection("inventory_adjustments")
    .where("itemId", "==", itemId)
    .get();

  const adjustments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      itemId: data.itemId,
      quantity: data.quantity ?? 0,
      unit: data.unit ?? "",
      baseQuantity: data.baseQuantity ?? data.quantity ?? 0,
      reason: data.reason ?? "other",
      note: data.note ?? undefined,
      createdAt: data.createdAt.toDate(),
    } as InventoryAdjustment;
  });

  return adjustments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createInventoryAdjustment(params: {
  companyId: string;
  itemId: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  reason: AdjustmentReason;
  note?: string | null;
}) {
  const adjustmentId = uuidv4();
  const itemRef = db.collection("items").doc(params.itemId);

  await db.runTransaction(async (transaction) => {
    const itemDoc = await transaction.get(itemRef);
    if (!itemDoc.exists) {
      throw new Error("Item not found");
    }
    const currentStock = Number(itemDoc.data()?.stockOnHand ?? 0);
    const nextStock = currentStock + params.baseQuantity;
    transaction.set(
      itemRef,
      { stockOnHand: nextStock, updatedAt: Timestamp.now() },
      { merge: true }
    );
    transaction.set(db.collection("inventory_adjustments").doc(adjustmentId), {
      companyId: params.companyId,
      itemId: params.itemId,
      quantity: params.quantity,
      unit: params.unit,
      baseQuantity: params.baseQuantity,
      reason: params.reason,
      note: params.note ?? null,
      createdAt: Timestamp.now(),
    });
  });

  return adjustmentId;
}
