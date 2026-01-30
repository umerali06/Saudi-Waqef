import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

const MAX_ATTEMPTS =
  Number.parseInt(process.env.AUTH_MAX_ATTEMPTS ?? "5", 10) || 5;
const WINDOW_MINUTES =
  Number.parseInt(process.env.AUTH_WINDOW_MINUTES ?? "15", 10) || 15;
const LOCKOUT_MINUTES =
  Number.parseInt(process.env.AUTH_LOCKOUT_MINUTES ?? "15", 10) || 15;

function loginKey(email: string) {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function getLoginThrottle(email: string) {
  const ref = db.collection("auth_login_attempts").doc(loginKey(email));
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return { locked: false, attempts: 0 };
  }
  const data = snapshot.data()!;
  const lockedUntil = data.lockedUntil?.toDate?.() as Date | undefined;
  const locked = Boolean(lockedUntil && lockedUntil > new Date());
  return {
    locked,
    attempts: data.count ?? 0,
    lockedUntil: lockedUntil ?? null,
  };
}

export async function registerFailedLogin(params: {
  email: string;
  ip?: string | null;
  userId?: string | null;
  reason?: string;
}) {
  const ref = db.collection("auth_login_attempts").doc(loginKey(params.email));
  const now = Timestamp.now();
  const snapshot = await ref.get();

  let count = 1;
  let firstAttemptAt = now;
  let lockedUntil: Timestamp | null = null;

  if (snapshot.exists) {
    const data = snapshot.data()!;
    const lastAttemptAt = data.lastAttemptAt?.toDate?.() as Date | undefined;
    const firstAttempt = data.firstAttemptAt?.toDate?.() as Date | undefined;
    const windowStart = firstAttempt ?? lastAttemptAt ?? new Date();
    const windowExpired =
      Date.now() - windowStart.getTime() > WINDOW_MINUTES * 60 * 1000;

    if (!windowExpired) {
      count = (data.count ?? 0) + 1;
      firstAttemptAt = data.firstAttemptAt ?? now;
    }
  }

  if (count >= MAX_ATTEMPTS) {
    lockedUntil = Timestamp.fromDate(
      new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
    );
  }

  await ref.set(
    {
      emailLower: params.email.trim().toLowerCase(),
      userId: params.userId ?? null,
      count,
      firstAttemptAt,
      lastAttemptAt: now,
      lockedUntil,
      lastIp: params.ip ?? null,
      reason: params.reason ?? null,
      updatedAt: now,
    },
    { merge: true }
  );

  return { count, lockedUntil: lockedUntil?.toDate?.() ?? null };
}

export async function clearLoginAttempts(email: string) {
  const ref = db.collection("auth_login_attempts").doc(loginKey(email));
  await ref.delete();
}
