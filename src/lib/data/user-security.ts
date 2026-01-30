import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type UserSecurityRecord = {
  userId: string;
  mfaEnabled: boolean;
  mfaSecret?: string | null;
  mfaTempSecret?: string | null;
  mfaEnrolledAt?: Date | null;
  lastLoginAt?: Date | null;
  lastLoginIp?: string | null;
};

export async function getUserSecurity(userId: string) {
  const doc = await db.collection("user_security").doc(userId).get();
  if (!doc.exists) {
    return {
      userId,
      mfaEnabled: false,
    } as UserSecurityRecord;
  }
  const data = doc.data()!;
  return {
    userId,
    mfaEnabled: Boolean(data.mfaEnabled),
    mfaSecret: data.mfaSecret ?? null,
    mfaTempSecret: data.mfaTempSecret ?? null,
    mfaEnrolledAt: data.mfaEnrolledAt?.toDate?.() ?? null,
    lastLoginAt: data.lastLoginAt?.toDate?.() ?? null,
    lastLoginIp: data.lastLoginIp ?? null,
  } as UserSecurityRecord;
}

export async function updateUserSecurity(
  userId: string,
  updates: Partial<UserSecurityRecord>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.mfaEnabled === undefined) {
    delete payload.mfaEnabled;
  }
  await db.collection("user_security").doc(userId).set(payload, { merge: true });
}
