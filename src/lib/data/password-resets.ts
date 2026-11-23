import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type PasswordResetRecord = {
  id: string;
  userId: string;
  emailLower: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function createPasswordReset(params: {
  userId: string;
  email: string;
  token: string;
  expiresAt: Date;
}) {
  const tokenHash = hashToken(params.token);
  const id = crypto.randomUUID();
  await db.collection("password_resets").doc(id).set({
    userId: params.userId,
    emailLower: params.email.trim().toLowerCase(),
    tokenHash,
    expiresAt: Timestamp.fromDate(params.expiresAt),
    usedAt: null,
    createdAt: Timestamp.now(),
  });
  return { id };
}

export async function getPasswordResetByToken(token: string) {
  const tokenHash = hashToken(token);
  const snapshot = await db
    .collection("password_resets")
    .where("tokenHash", "==", tokenHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    userId: data.userId,
    emailLower: data.emailLower,
    tokenHash: data.tokenHash,
    expiresAt: data.expiresAt.toDate(),
    usedAt: data.usedAt?.toDate?.() ?? null,
    createdAt: data.createdAt.toDate(),
  } as PasswordResetRecord;
}

/** Uses up every open link of the user, so an older mail cannot change the password again. */
export async function closePasswordResets(userId: string) {
  const snapshot = await db.collection("password_resets").where("userId", "==", userId).get();
  const batch = db.batch();
  snapshot.docs
    .filter((doc) => !doc.data().usedAt)
    .forEach((doc) => batch.update(doc.ref, { usedAt: Timestamp.now() }));
  await batch.commit();
}

export function isResetExpired(reset: PasswordResetRecord) {
  return reset.expiresAt.getTime() < Date.now();
}
