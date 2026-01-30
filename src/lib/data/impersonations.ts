import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type ImpersonationStatus = "active" | "ended" | "expired";

export type ImpersonationRecord = {
  id: string;
  adminUserId: string;
  adminEmail?: string;
  targetUserId: string;
  targetEmail?: string;
  companyId?: string | null;
  reason?: string | null;
  status: ImpersonationStatus;
  createdAt: Date;
  expiresAt: Date;
  endedAt?: Date | null;
  endedBy?: string | null;
};

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

export async function createImpersonation(params: {
  adminUserId: string;
  adminEmail?: string | null;
  targetUserId: string;
  targetEmail?: string | null;
  companyId?: string | null;
  reason?: string | null;
  ttlMs?: number;
}) {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (params.ttlMs ?? DEFAULT_TTL_MS));

  await db.collection("impersonations").doc(id).set({
    adminUserId: params.adminUserId,
    adminEmail: params.adminEmail ?? null,
    targetUserId: params.targetUserId,
    targetEmail: params.targetEmail ?? null,
    companyId: params.companyId ?? null,
    reason: params.reason ?? null,
    status: "active",
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
  });

  return await getImpersonation(id);
}

export async function getImpersonation(id: string) {
  const doc = await db.collection("impersonations").doc(id).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    adminUserId: data.adminUserId,
    adminEmail: data.adminEmail ?? undefined,
    targetUserId: data.targetUserId,
    targetEmail: data.targetEmail ?? undefined,
    companyId: data.companyId ?? null,
    reason: data.reason ?? null,
    status: (data.status ?? "active") as ImpersonationStatus,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(),
    endedAt: data.endedAt?.toDate ? data.endedAt.toDate() : null,
    endedBy: data.endedBy ?? null,
  } as ImpersonationRecord;
}

export async function getActiveImpersonation(id: string) {
  const record = await getImpersonation(id);
  if (!record) {
    return null;
  }
  if (record.status !== "active") {
    return null;
  }
  const now = Date.now();
  if (record.expiresAt.getTime() <= now) {
    await db.collection("impersonations").doc(id).set(
      {
        status: "expired",
        endedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    return null;
  }
  return record;
}

export async function endImpersonation(params: {
  id: string;
  endedBy: string;
  reason?: string | null;
}) {
  await db.collection("impersonations").doc(params.id).set(
    {
      status: "ended",
      endedAt: Timestamp.now(),
      endedBy: params.endedBy,
      reason: params.reason ?? null,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return await getImpersonation(params.id);
}
