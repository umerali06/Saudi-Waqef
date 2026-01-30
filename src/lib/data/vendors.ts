import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type VendorStatus = "active" | "inactive";

export type VendorRecord = {
  id: string;
  companyId: string;
  name: string;
  legalName?: string;
  vatRegistered: boolean;
  vatNumber?: string;
  crNumber?: string;
  email?: string;
  phone?: string;
  remittanceAddress?: string;
  paymentTermId?: string | null;
  preferredPaymentMethod?: string;
  currency: string;
  notes?: string;
  tags: string[];
  status: VendorStatus;
  createdAt: Date;
};

export async function listVendors(companyId: string) {
  const snapshot = await db
    .collection("vendors")
    .where("companyId", "==", companyId)
    .get();

  const vendors = snapshot.docs.map((doc) => {
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
      remittanceAddress: data.remittanceAddress ?? undefined,
      paymentTermId: data.paymentTermId ?? null,
      preferredPaymentMethod: data.preferredPaymentMethod ?? undefined,
      currency: data.currency ?? "SAR",
      notes: data.notes ?? undefined,
      tags: data.tags ?? [],
      status: data.status ?? "active",
      createdAt: data.createdAt.toDate(),
    } as VendorRecord;
  });

  return vendors.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getVendorById(vendorId: string) {
  const doc = await db.collection("vendors").doc(vendorId).get();
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
    remittanceAddress: data.remittanceAddress ?? undefined,
    paymentTermId: data.paymentTermId ?? null,
    preferredPaymentMethod: data.preferredPaymentMethod ?? undefined,
    currency: data.currency ?? "SAR",
    notes: data.notes ?? undefined,
    tags: data.tags ?? [],
    status: data.status ?? "active",
    createdAt: data.createdAt.toDate(),
  } as VendorRecord;
}

export async function createVendor(params: {
  companyId: string;
  name: string;
  legalName?: string | null;
  vatRegistered: boolean;
  vatNumber?: string | null;
  crNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  remittanceAddress?: string | null;
  paymentTermId?: string | null;
  preferredPaymentMethod?: string | null;
  currency?: string | null;
  notes?: string | null;
  tags?: string[];
  status?: VendorStatus;
}) {
  const id = uuidv4();
  const normalizedName = normalizeSearch(params.name);
  await db.collection("vendors").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    nameNormalized: normalizedName,
    legalName: params.legalName ?? null,
    vatRegistered: params.vatRegistered,
    vatNumber: params.vatNumber ?? null,
    crNumber: params.crNumber ?? null,
    email: params.email ?? null,
    phone: params.phone ?? null,
    remittanceAddress: params.remittanceAddress ?? null,
    paymentTermId: params.paymentTermId ?? null,
    preferredPaymentMethod: params.preferredPaymentMethod ?? null,
    currency: params.currency ?? "SAR",
    notes: params.notes ?? null,
    tags: params.tags ?? [],
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateVendor(
  vendorId: string,
  updates: Partial<{
    name: string;
    legalName: string | null;
    vatRegistered: boolean;
    vatNumber: string | null;
    crNumber: string | null;
    email: string | null;
    phone: string | null;
    remittanceAddress: string | null;
    paymentTermId: string | null;
    preferredPaymentMethod: string | null;
    currency: string | null;
    notes: string | null;
    tags: string[];
    status: VendorStatus;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.name) {
    payload.nameNormalized = normalizeSearch(updates.name);
  }
  await db.collection("vendors").doc(vendorId).set(payload, { merge: true });
}

export async function bulkUpdateVendors(
  vendorIds: string[],
  updates: Partial<Pick<VendorRecord, "status">>
) {
  const batch = db.batch();
  const updatePayload = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  vendorIds.forEach((id) => {
    batch.set(db.collection("vendors").doc(id), updatePayload, { merge: true });
  });
  await batch.commit();
}
