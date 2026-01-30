import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getCache, invalidateCache, setCache } from "@/lib/utils/cache";

export type PaymentTerm = {
  id: string;
  companyId: string;
  name: string;
  days: number;
  status: "active" | "inactive";
  createdAt: Date;
};

export async function listPaymentTerms(companyId: string) {
  const cacheKey = `payment_terms:${companyId}`;
  const cached = getCache<PaymentTerm[]>(cacheKey);
  if (cached) {
    return cached;
  }
  const snapshot = await db
    .collection("payment_terms")
    .where("companyId", "==", companyId)
    .get();

  const terms = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name,
      days: data.days,
      status: data.status ?? "active",
      createdAt: data.createdAt.toDate(),
    } as PaymentTerm;
  });

  return setCache(
    cacheKey,
    terms.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
  );
}

export async function createPaymentTerm(params: {
  companyId: string;
  name: string;
  days: number;
  status?: PaymentTerm["status"];
}) {
  const id = uuidv4();
  await db.collection("payment_terms").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    days: params.days,
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });
  invalidateCache(`payment_terms:${params.companyId}`);
  return id;
}

export async function getPaymentTerm(termId: string) {
  const doc = await db.collection("payment_terms").doc(termId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name,
    days: data.days,
    status: data.status ?? "active",
    createdAt: data.createdAt.toDate(),
  } as PaymentTerm;
}

export async function updatePaymentTerm(
  termId: string,
  updates: Partial<Pick<PaymentTerm, "name" | "days" | "status">>
) {
  await db.collection("payment_terms").doc(termId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  const updated = await getPaymentTerm(termId);
  if (updated?.companyId) {
    invalidateCache(`payment_terms:${updated.companyId}`);
  }
}
