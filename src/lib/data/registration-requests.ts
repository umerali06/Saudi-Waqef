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
  /** Missing on requests made before the two kinds were told apart. */
  kind?: "new" | "join";
  crNumber?: string;
  vatNumber?: string;
  locale?: "ar" | "en";
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
  kind: "new" | "join";
  crNumber?: string | null;
  vatNumber?: string | null;
  locale?: "ar" | "en";
  ip?: string | null;
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
    kind: params.kind,
    crNumber: params.crNumber ?? null,
    vatNumber: params.vatNumber ?? null,
    locale: params.locale ?? "ar",
    ip: params.ip ?? null,
    status: "pending",
    createdAt: Timestamp.now(),
  });

  return id;
}

export async function getRegistrationRequests(status?: "pending" | "approved" | "rejected") {
  // Sorted in memory: a status filter plus orderBy would need a composite index.
  const snapshot = status
    ? await db.collection(COLLECTION).where("status", "==", status).get()
    : await db.collection(COLLECTION).get();

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
      kind: data.kind ?? undefined,
      crNumber: data.crNumber ?? undefined,
      vatNumber: data.vatNumber ?? undefined,
      locale: data.locale ?? undefined,
      status: data.status,
      createdAt: data.createdAt.toDate(),
      processedAt: data.processedAt?.toDate(),
    } as RegistrationRequest;
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listRecentRequests(params: { emailLower: string; ip?: string | null }) {
  const since = Date.now() - 60 * 60 * 1000;
  const [byEmail, byIp] = await Promise.all([
    db.collection(COLLECTION).where("emailLower", "==", params.emailLower).get(),
    params.ip ? db.collection(COLLECTION).where("ip", "==", params.ip).get() : null,
  ]);
  const isRecent = (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
    (doc.data().createdAt?.toDate?.().getTime() ?? 0) >= since;
  return {
    pending: byEmail.docs
      .filter((doc) => doc.data().status === "pending")
      .map((doc) => ({
        id: doc.id,
        companyName: String(doc.data().companyName ?? ""),
        kind: doc.data().kind as "new" | "join" | undefined,
      })),
    emailCount: byEmail.docs.filter(isRecent).length,
    ipCount: byIp ? byIp.docs.filter(isRecent).length : 0,
  };
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
    kind: data.kind ?? undefined,
    crNumber: data.crNumber ?? undefined,
    vatNumber: data.vatNumber ?? undefined,
    locale: data.locale ?? undefined,
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
