import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type SystemAdminRole = "super_admin" | "admin";

export type SystemAdminRecord = {
  id: string;
  userId: string;
  email?: string;
  name?: string;
  role: SystemAdminRole;
  mfaVerifiedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function getSystemAdminEmails() {
  const value = process.env.SYSTEM_ADMIN_EMAILS ?? "";
  return value
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

export async function getSystemAdmin(userId: string) {
  const doc = await db.collection("system_admins").doc(userId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    userId: data.userId,
    email: data.email ?? undefined,
    name: data.name ?? undefined,
    role: (data.role ?? "admin") as SystemAdminRole,
    mfaVerifiedAt: data.mfaVerifiedAt?.toDate ? data.mfaVerifiedAt.toDate() : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as SystemAdminRecord;
}

export async function listSystemAdmins() {
  const snapshot = await db.collection("system_admins").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      email: data.email ?? undefined,
      name: data.name ?? undefined,
      role: (data.role ?? "admin") as SystemAdminRole,
      mfaVerifiedAt: data.mfaVerifiedAt?.toDate ? data.mfaVerifiedAt.toDate() : null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as SystemAdminRecord;
  });
}

export async function ensureSystemAdmin(params: {
  userId: string;
  email?: string | null;
  name?: string | null;
  role?: SystemAdminRole;
}) {
  const existing = await getSystemAdmin(params.userId);
  if (existing) {
    return existing;
  }

  await db.collection("system_admins").doc(params.userId).set({
    userId: params.userId,
    email: params.email ?? null,
    name: params.name ?? null,
    role: params.role ?? "admin",
    mfaVerifiedAt: null,
    createdAt: Timestamp.now(),
  });

  return await getSystemAdmin(params.userId);
}

export async function isSystemAdminUser(userId: string, email?: string | null) {
  if (email) {
    const allowed = getSystemAdminEmails();
    if (allowed.includes(normalizeEmail(email))) {
      return true;
    }
  }
  const record = await getSystemAdmin(userId);
  return Boolean(record);
}

export async function setSystemAdminMfaVerified(userId: string, verified: boolean) {
  await db.collection("system_admins").doc(userId).set(
    {
      mfaVerifiedAt: verified ? Timestamp.now() : null,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return await getSystemAdmin(userId);
}
