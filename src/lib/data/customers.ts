import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type CustomerStatus = "active" | "inactive" | "blacklisted";

export type CustomerRecord = {
  id: string;
  companyId: string;
  name: string;
  legalName?: string;
  vatRegistered: boolean;
  vatNumber?: string;
  crNumber?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  paymentTermId?: string | null;
  creditLimit?: number | null;
  currency: string;
  notes?: string;
  tags: string[];
  status: CustomerStatus;
  createdAt: Date;
};

export async function listCustomers(companyId: string) {
  const snapshot = await db
    .collection("customers")
    .where("companyId", "==", companyId)
    .get();

  const customers = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name,
      legalName: data.legalName ?? undefined,
      vatRegistered: Boolean(data.vatRegistered),
      vatNumber: data.vatNumber ?? undefined,
      crNumber: data.crNumber ?? undefined,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      billingAddress: data.billingAddress ?? undefined,
      shippingAddress: data.shippingAddress ?? undefined,
      paymentTermId: data.paymentTermId ?? null,
      creditLimit: data.creditLimit ?? null,
      currency: data.currency ?? "SAR",
      notes: data.notes ?? undefined,
      tags: data.tags ?? [],
      status: data.status ?? "active",
      createdAt: data.createdAt.toDate(),
    } as CustomerRecord;
  });

  return customers.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCustomerById(customerId: string) {
  const doc = await db.collection("customers").doc(customerId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name,
    legalName: data.legalName ?? undefined,
    vatRegistered: Boolean(data.vatRegistered),
    vatNumber: data.vatNumber ?? undefined,
    crNumber: data.crNumber ?? undefined,
    email: data.email ?? undefined,
    phone: data.phone ?? undefined,
    billingAddress: data.billingAddress ?? undefined,
    shippingAddress: data.shippingAddress ?? undefined,
    paymentTermId: data.paymentTermId ?? null,
    creditLimit: data.creditLimit ?? null,
    currency: data.currency ?? "SAR",
    notes: data.notes ?? undefined,
    tags: data.tags ?? [],
    status: data.status ?? "active",
    createdAt: data.createdAt.toDate(),
  } as CustomerRecord;
}

export async function createCustomer(params: {
  companyId: string;
  name: string;
  legalName?: string | null;
  vatRegistered: boolean;
  vatNumber?: string | null;
  crNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  paymentTermId?: string | null;
  creditLimit?: number | null;
  currency?: string | null;
  notes?: string | null;
  tags?: string[];
  status?: CustomerStatus;
}) {
  const id = uuidv4();
  const normalizedName = normalizeSearch(params.name);
  await db.collection("customers").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    nameNormalized: normalizedName,
    legalName: params.legalName ?? null,
    vatRegistered: params.vatRegistered,
    vatNumber: params.vatNumber ?? null,
    crNumber: params.crNumber ?? null,
    email: params.email ?? null,
    phone: params.phone ?? null,
    billingAddress: params.billingAddress ?? null,
    shippingAddress: params.shippingAddress ?? null,
    paymentTermId: params.paymentTermId ?? null,
    creditLimit: params.creditLimit ?? null,
    currency: params.currency ?? "SAR",
    notes: params.notes ?? null,
    tags: params.tags ?? [],
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateCustomer(
  customerId: string,
  updates: Partial<{
    name: string;
    legalName: string | null;
    vatRegistered: boolean;
    vatNumber: string | null;
    crNumber: string | null;
    email: string | null;
    phone: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
    paymentTermId: string | null;
    creditLimit: number | null;
    currency: string | null;
    notes: string | null;
    tags: string[];
    status: CustomerStatus;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.name) {
    payload.nameNormalized = normalizeSearch(updates.name);
  }
  await db.collection("customers").doc(customerId).set(payload, { merge: true });
}

export async function bulkUpdateCustomers(
  customerIds: string[],
  updates: Partial<Pick<CustomerRecord, "status">>
) {
  const batch = db.batch();
  const updatePayload = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  customerIds.forEach((id) => {
    batch.set(db.collection("customers").doc(id), updatePayload, { merge: true });
  });
  await batch.commit();
}
