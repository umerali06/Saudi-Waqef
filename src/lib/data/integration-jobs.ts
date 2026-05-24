import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type IntegrationJobStatus = "queued" | "running" | "failed" | "success";

export type IntegrationJob = {
  id: string;
  companyId: string;
  integrationId: string;
  type: "sync" | "test";
  status: IntegrationJobStatus;
  attempts: number;
  lastError?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listIntegrationJobs(
  integrationId: string,
  limitCount = 20
) {
  const snapshot = await db
    .collection("integration_jobs")
    .where("integrationId", "==", integrationId)
    .get();

  const jobs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      integrationId: data.integrationId,
      type: data.type ?? "sync",
      status: data.status ?? "queued",
      attempts: data.attempts ?? 0,
      lastError: data.lastError ?? null,
      startedAt: data.startedAt?.toDate ? data.startedAt.toDate() : null,
      finishedAt: data.finishedAt?.toDate ? data.finishedAt.toDate() : null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as IntegrationJob;
  });

  return jobs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
}

export async function createIntegrationJob(params: {
  companyId: string;
  integrationId: string;
  type: "sync" | "test";
  status?: IntegrationJobStatus;
  attempts?: number;
  lastError?: string | null;
}) {
  const id = uuidv4();
  await db.collection("integration_jobs").doc(id).set({
    companyId: params.companyId,
    integrationId: params.integrationId,
    type: params.type,
    status: params.status ?? "queued",
    attempts: params.attempts ?? 0,
    lastError: params.lastError ?? null,
    startedAt: (params.status ?? "queued") === "running" ? Timestamp.now() : null,
    finishedAt: null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function getRunningIntegrationJob(params: {
  integrationId: string;
  type: "sync" | "test";
}) {
  const snapshot = await db
    .collection("integration_jobs")
    .where("integrationId", "==", params.integrationId)
    .where("type", "==", params.type)
    .where("status", "==", "running")
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    companyId: data.companyId,
    integrationId: data.integrationId,
    type: data.type ?? "sync",
    status: data.status ?? "running",
    attempts: data.attempts ?? 0,
    lastError: data.lastError ?? null,
    startedAt: data.startedAt?.toDate ? data.startedAt.toDate() : null,
    finishedAt: data.finishedAt?.toDate ? data.finishedAt.toDate() : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as IntegrationJob;
}

export async function updateIntegrationJob(
  jobId: string,
  updates: Partial<{
    status: IntegrationJobStatus;
    attempts: number;
    lastError: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>
) {
  const payload: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }
  if (updates.attempts !== undefined) {
    payload.attempts = updates.attempts;
  }
  if (updates.lastError !== undefined) {
    payload.lastError = updates.lastError;
  }
  if (updates.startedAt === null) {
    payload.startedAt = null;
  } else if (updates.startedAt instanceof Date) {
    payload.startedAt = Timestamp.fromDate(updates.startedAt);
  }
  if (updates.finishedAt === null) {
    payload.finishedAt = null;
  } else if (updates.finishedAt instanceof Date) {
    payload.finishedAt = Timestamp.fromDate(updates.finishedAt);
  }

  await db.collection("integration_jobs").doc(jobId).set(
    payload,
    { merge: true }
  );
}
