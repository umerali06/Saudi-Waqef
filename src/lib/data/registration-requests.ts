import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { v4 as uuid } from "uuid";

export type RegistrationRequest = {
  id: string;
  email: string;
  name: string;
  companyId?: string;
  companyName: string;
  phone?: string;
  requestedRole: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  processedAt?: Date;
};

const COLLECTION = "registration_requests";

export async function createRegistrationRequest(params: {
  email: string;
  name: string;
  companyId?: string;
  companyName: string;
  phone?: string;
  requestedRole: string;
}) {
  const id = uuid();
  const normalizedEmail = params.email.trim().toLowerCase();

  await db.collection(COLLECTION).doc(id).set({
    email: params.email.trim(),
    emailLower: normalizedEmail,
    name: params.name.trim(),
    companyId: params.companyId?.trim() || null,
    companyName: params.companyName.trim(),
    phone: params.phone?.trim() || null,
    requestedRole: params.requestedRole,
    status: "pending",
    createdAt: Timestamp.now(),
  });

  return id;
}

export async function getRegistrationRequests(status?: "pending" | "approved" | "rejected") {
  let query = db.collection(COLLECTION).orderBy("createdAt", "desc");
  
  if (status) {
    query = query.where("status", "==", status);
  }

  const snapshot = await query.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      email: data.email,
      name: data.name,
      companyId: data.companyId ?? undefined,
      companyName: data.companyName,
      phone: data.phone,
      requestedRole: data.requestedRole,
      status: data.status,
      createdAt: data.createdAt.toDate(),
      processedAt: data.processedAt?.toDate(),
    } as RegistrationRequest;
  });
}

export async function getRegistrationRequestById(id: string) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  
  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    email: data.email,
    name: data.name,
    companyId: data.companyId ?? undefined,
    companyName: data.companyName,
    phone: data.phone,
    requestedRole: data.requestedRole,
    notes: data.notes,
    adminNotes: data.adminNotes,
    verificationDocuments: data.verificationDocuments,
    status: data.status,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    processedAt: data.processedAt?.toDate ? data.processedAt.toDate() : undefined,
  } as RegistrationRequest;
}

export async function updateRegistrationRequestStatus(
  id: string, 
  status: "approved" | "rejected"
) {
  await db.collection(COLLECTION).doc(id).update({
    status,
    processedAt: Timestamp.now(),
  });
}
