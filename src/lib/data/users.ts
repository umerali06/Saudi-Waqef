import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { hashPassword } from "@/lib/security/password";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: "active" | "invited";
  createdAt: Date;
};

export async function hasAnyUsers() {
  const snapshot = await db.collection("users").limit(1).get();
  return !snapshot.empty;
}

export async function getUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const snapshot = await db
    .collection("users")
    .where("emailLower", "==", normalized)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    status: data.status,
    createdAt: data.createdAt.toDate(),
  } as UserRecord;
}

export async function getUserById(userId: string) {
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    status: data.status,
    createdAt: data.createdAt.toDate(),
  } as UserRecord;
}

export async function createUser(params: {
  id: string;
  email: string;
  name: string;
  password: string;
  status?: "active" | "invited";
}) {
  const normalized = params.email.trim().toLowerCase();
  const passwordHash = await hashPassword(params.password);

  await db.collection("users").doc(params.id).set({
    email: params.email.trim(),
    emailLower: normalized,
    name: params.name.trim(),
    passwordHash,
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });

  return getUserById(params.id);
}

export async function updateUserPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  await db.collection("users").doc(userId).set(
    {
      passwordHash,
      status: "active",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
