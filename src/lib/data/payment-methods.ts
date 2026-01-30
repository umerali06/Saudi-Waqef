import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type PaymentMethod = {
  id: string;
  companyId: string;
  type: "card" | "bank";
  brand?: string | null;
  last4: string;
  expMonth?: number | null;
  expYear?: number | null;
  token: string;
  isDefault: boolean;
  createdAt: Date;
};

export async function listPaymentMethods(companyId: string) {
  const snapshot = await db
    .collection("payment_methods")
    .where("companyId", "==", companyId)
    .get();

  const methods = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      type: data.type ?? "card",
      brand: data.brand ?? null,
      last4: data.last4 ?? "",
      expMonth: data.expMonth ?? null,
      expYear: data.expYear ?? null,
      token: data.token ?? "",
      isDefault: Boolean(data.isDefault),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as PaymentMethod;
  });

  return methods.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function createPaymentMethod(params: {
  companyId: string;
  type: "card" | "bank";
  brand?: string | null;
  last4: string;
  expMonth?: number | null;
  expYear?: number | null;
  token: string;
  isDefault: boolean;
}) {
  const id = uuidv4();
  await db.collection("payment_methods").doc(id).set({
    companyId: params.companyId,
    type: params.type,
    brand: params.brand ?? null,
    last4: params.last4,
    expMonth: params.expMonth ?? null,
    expYear: params.expYear ?? null,
    token: params.token,
    isDefault: params.isDefault,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updatePaymentMethod(
  methodId: string,
  updates: Partial<{
    isDefault: boolean;
  }>
) {
  await db.collection("payment_methods").doc(methodId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function deletePaymentMethod(methodId: string) {
  await db.collection("payment_methods").doc(methodId).delete();
}
