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
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateIntegrationJob(
  jobId: string,
  updates: Partial<{
    status: IntegrationJobStatus;
    attempts: number;
    lastError: string | null;
  }>
) {
  await db.collection("integration_jobs").doc(jobId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
