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

const STALE_JOB_MS = 15 * 60 * 1000;

export async function getRunningIntegrationJob(params: {
  integrationId: string;
  type: "sync" | "test";
}) {
  const snapshot = await db
    .collection("integration_jobs")
    .where("integrationId", "==", params.integrationId)
    .where("type", "==", params.type)
    .where("status", "==", "running")
    .get();

  // A serverless instance killed mid-run leaves its job "running" forever,
  // which would block every later run of the integration.
  const isStale = (startedAt: Date | null) =>
    !startedAt || Date.now() - startedAt.getTime() > STALE_JOB_MS;
  let doc: (typeof snapshot.docs)[number] | null = null;
  for (const candidate of snapshot.docs) {
    const value = candidate.data().startedAt ?? candidate.data().createdAt;
    if (isStale(value?.toDate ? value.toDate() : null)) {
      await updateIntegrationJob(candidate.id, {
        status: "failed",
        lastError: "The job stopped without finishing.",
        finishedAt: new Date(),
      });
    } else {
      doc = candidate;
    }
  }
  if (!doc) {
    return null;
  }
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
