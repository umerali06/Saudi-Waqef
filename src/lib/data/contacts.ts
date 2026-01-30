import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import type { PartyType } from "@/lib/data/open-items";

export type ContactRecord = {
  id: string;
  companyId: string;
  partyType: PartyType;
  partyId: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary: boolean;
  createdAt: Date;
};

export async function listContacts(params: {
  companyId: string;
  partyType: PartyType;
  partyId: string;
}) {
  const snapshot = await db
    .collection("contacts")
    .where("companyId", "==", params.companyId)
    .where("partyType", "==", params.partyType)
    .where("partyId", "==", params.partyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      partyType: data.partyType,
      partyId: data.partyId,
      name: data.name,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      role: data.role ?? undefined,
      isPrimary: Boolean(data.isPrimary),
      createdAt: data.createdAt.toDate(),
    } as ContactRecord;
  });
}

export async function getContact(contactId: string) {
  const doc = await db.collection("contacts").doc(contactId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    partyType: data.partyType,
    partyId: data.partyId,
    name: data.name,
    email: data.email ?? undefined,
    phone: data.phone ?? undefined,
    role: data.role ?? undefined,
    isPrimary: Boolean(data.isPrimary),
    createdAt: data.createdAt.toDate(),
  } as ContactRecord;
}

export async function createContact(params: {
  companyId: string;
  partyType: PartyType;
  partyId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  isPrimary?: boolean;
}) {
  const id = uuidv4();
  await db.collection("contacts").doc(id).set({
    companyId: params.companyId,
    partyType: params.partyType,
    partyId: params.partyId,
    name: params.name.trim(),
    email: params.email ?? null,
    phone: params.phone ?? null,
    role: params.role ?? null,
    isPrimary: params.isPrimary ?? false,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateContact(
  contactId: string,
  updates: Partial<Pick<ContactRecord, "name" | "email" | "phone" | "role" | "isPrimary">>
) {
  await db.collection("contacts").doc(contactId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function deleteContact(contactId: string) {
  await db.collection("contacts").doc(contactId).delete();
}

export async function setPrimaryContact(params: {
  companyId: string;
  partyType: PartyType;
  partyId: string;
  contactId: string;
}) {
  const contacts = await listContacts(params);
  const batch = db.batch();
  contacts.forEach((contact) => {
    const nextPrimary = contact.id === params.contactId;
    batch.set(
      db.collection("contacts").doc(contact.id),
      { isPrimary: nextPrimary, updatedAt: Timestamp.now() },
      { merge: true }
    );
  });
  await batch.commit();
}
