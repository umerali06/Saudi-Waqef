import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AccountingPaymentMethod = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  defaultAccountId?: string | null;
  status: "active" | "inactive";
  isSystem: boolean;
  createdAt: Date;
  updatedAt?: Date;
};

const COLLECTION = "accounting_payment_methods";

const DEFAULT_METHODS = [
  { code: "cash", name: "Cash" },
  { code: "bank", name: "Bank transfer" },
  { code: "card", name: "Card" },
  { code: "cheque", name: "Cheque" },
  { code: "online", name: "Online" },
  { code: "other", name: "Other" },
];

export async function listAccountingPaymentMethods(companyId: string) {
  const collection = db.collection(COLLECTION);
  let snapshot = await collection.where("companyId", "==", companyId).get();

  if (snapshot.empty) {
    const batch = db.batch();
    DEFAULT_METHODS.forEach((method) => {
      const id = uuidv4();
      const ref = collection.doc(id);
      batch.set(ref, {
        companyId,
        code: method.code,
        name: method.name,
        defaultAccountId: null,
        status: "active",
        isSystem: true,
        createdAt: Timestamp.now(),
      });
    });
    await batch.commit();
    snapshot = await collection.where("companyId", "==", companyId).get();
  }

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      code: data.code ?? "",
      name: data.name ?? "",
      defaultAccountId: data.defaultAccountId ?? null,
      status: (data.status ?? "active") as "active" | "inactive",
      isSystem: Boolean(data.isSystem),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as AccountingPaymentMethod;
  });
}

export async function getAccountingPaymentMethodById(methodId: string) {
  const doc = await db.collection(COLLECTION).doc(methodId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    companyId: data.companyId,
    code: data.code ?? "",
    name: data.name ?? "",
    defaultAccountId: data.defaultAccountId ?? null,
    status: (data.status ?? "active") as "active" | "inactive",
    isSystem: Boolean(data.isSystem),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as AccountingPaymentMethod;
}

export async function createAccountingPaymentMethod(params: {
  companyId: string;
  code: string;
  name: string;
  defaultAccountId?: string | null;
  status?: "active" | "inactive";
  isSystem?: boolean;
}) {
  const id = uuidv4();
  await db.collection(COLLECTION).doc(id).set({
    companyId: params.companyId,
    code: params.code,
    name: params.name,
    defaultAccountId: params.defaultAccountId ?? null,
    status: params.status ?? "active",
    isSystem: Boolean(params.isSystem),
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateAccountingPaymentMethod(
  methodId: string,
  updates: Partial<{
    name: string;
    defaultAccountId: string | null;
    status: "active" | "inactive";
  }>
) {
  await db.collection(COLLECTION).doc(methodId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
