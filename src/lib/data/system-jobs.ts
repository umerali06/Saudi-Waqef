import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type SystemJobStatus = "ok" | "warning" | "failed" | "idle";

export type SystemJob = {
  id: string;
  name: string;
  category: string;
  status: SystemJobStatus;
  lastRunAt?: Date | null;
  lastSuccessAt?: Date | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listSystemJobs() {
  const snapshot = await db.collection("system_jobs").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name ?? "",
      category: data.category ?? "general",
      status: (data.status ?? "idle") as SystemJobStatus,
      lastRunAt: data.lastRunAt?.toDate ? data.lastRunAt.toDate() : null,
      lastSuccessAt: data.lastSuccessAt?.toDate ? data.lastSuccessAt.toDate() : null,
      lastError: data.lastError ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as SystemJob;
  });
}

export async function createSystemJob(params: {
  name: string;
  category: string;
  status?: SystemJobStatus;
}) {
  const id = crypto.randomUUID();
  await db.collection("system_jobs").doc(id).set({
    name: params.name,
    category: params.category,
    status: params.status ?? "idle",
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateSystemJob(
  jobId: string,
  updates: Partial<{
    name: string;
    category: string;
    status: SystemJobStatus;
    lastRunAt: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.lastRunAt !== undefined) {
    payload.lastRunAt = updates.lastRunAt
      ? Timestamp.fromDate(updates.lastRunAt)
      : null;
  }
  if (updates.lastSuccessAt !== undefined) {
    payload.lastSuccessAt = updates.lastSuccessAt
      ? Timestamp.fromDate(updates.lastSuccessAt)
      : null;
  }
  await db.collection("system_jobs").doc(jobId).set(payload, { merge: true });
}
