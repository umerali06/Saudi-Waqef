import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import type { ZatcaEnvironment } from "@/lib/integrations/zatca/environment";
import { decryptString, encryptString } from "@/lib/security/crypto";

const readCredentials = (data: Record<string, unknown>) => {
  if (typeof data.credentialsEnc === "string" && data.credentialsEnc) {
    return JSON.parse(decryptString(data.credentialsEnc)) as Record<string, unknown>;
  }
  return (data.credentials ?? {}) as Record<string, unknown>;
};

export type IntegrationConnector = "zatca" | "gosi" | "mudad" | "custom";
export type IntegrationStatus = "inactive" | "active" | "error";
export type IntegrationEnvironment = ZatcaEnvironment;

export type IntegrationRecord = {
  id: string;
  companyId: string;
  name: string;
  connector: IntegrationConnector;
  status: IntegrationStatus;
  environment: IntegrationEnvironment;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  lastSyncAt?: Date;
  lastError?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listIntegrations(companyId: string) {
  const snapshot = await db
    .collection("integrations")
    .where("companyId", "==", companyId)
    .get();

  const integrations = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name ?? data.connector,
      connector: data.connector ?? "custom",
      status: data.status ?? "inactive",
      environment: data.environment ?? "sandbox",
      config: data.config ?? {},
      credentials: readCredentials(data),
      lastSyncAt: data.lastSyncAt?.toDate ? data.lastSyncAt.toDate() : undefined,
      lastError: data.lastError ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as IntegrationRecord;
  });

  return integrations.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getIntegrationById(integrationId: string) {
  const doc = await db.collection("integrations").doc(integrationId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name ?? data.connector,
    connector: data.connector ?? "custom",
    status: data.status ?? "inactive",
    environment: data.environment ?? "sandbox",
    config: data.config ?? {},
    credentials: readCredentials(data),
    lastSyncAt: data.lastSyncAt?.toDate ? data.lastSyncAt.toDate() : undefined,
    lastError: data.lastError ?? null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as IntegrationRecord;
}

export async function createIntegration(params: {
  companyId: string;
  name: string;
  connector: IntegrationConnector;
  status?: IntegrationStatus;
  environment?: IntegrationEnvironment;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}) {
  const id = uuidv4();
  await db.collection("integrations").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    connector: params.connector,
    status: params.status ?? "inactive",
    environment: params.environment ?? "sandbox",
    config: params.config ?? {},
    credentialsEnc: encryptString(JSON.stringify(params.credentials ?? {})),
    credentials: null,
    createdAt: Timestamp.now(),
  });
  return id;
}

/**
 * Merges the given fields. `config` is merged key by key, so callers pass only
 * the keys they change: writing back a whole config read earlier would roll the
 * ZATCA hash chain back to the moment it was read.
 */
export async function updateIntegration(
  integrationId: string,
  updates: Partial<{
    name: string;
    status: IntegrationStatus;
    environment: IntegrationEnvironment;
    config: Record<string, unknown>;
    credentials: Record<string, unknown>;
    lastSyncAt: Date | null;
    lastError: string | null;
  }>
) {
  const payload: Record<string, unknown> = { updatedAt: Timestamp.now() };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) payload[key] = value;
  }
  if (updates.credentials) {
    payload.credentialsEnc = encryptString(JSON.stringify(updates.credentials));
    delete payload.credentials;
    payload.credentials = null;
  }
  if (updates.lastSyncAt instanceof Date) {
    payload.lastSyncAt = Timestamp.fromDate(updates.lastSyncAt);
  }
  // mapping/headers/payloadTemplate are edited as a whole; a deep merge would
  // resurrect keys the user removed, so they are replaced.
  const ref = db.collection("integrations").doc(integrationId);
  if (updates.config) {
    delete payload.config;
    for (const [key, value] of Object.entries(updates.config)) {
      if (value !== undefined) payload[`config.${key}`] = value;
    }
    await ref.update(payload);
    return;
  }
  await ref.set(payload, { merge: true });
}

/**
 * Persists the ZATCA hash-chain counter only if the caller still holds the
 * submission lock it claimed via `acquireZatcaSubmissionLock`. Guards against
 * the lock's TTL expiring mid-run and a second caller starting a fresh
 * submission against the same integration while this one is still writing.
 */
export async function updateIntegrationZatcaChainInTransaction(params: {
  integrationId: string;
  expectedLockRunId: string;
  chain: { lastHash: string; lastUuid: string; counter: number; updatedAt: string };
}) {
  const lockRef = db.collection("zatca_submission_locks").doc(params.integrationId);
  const integrationRef = db.collection("integrations").doc(params.integrationId);

  await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (!lockSnap.exists || lockSnap.data()?.runId !== params.expectedLockRunId) {
      throw new Error(`ZATCA_LOCK_LOST: submission lock for integration ${params.integrationId} was lost mid-run.`);
    }
    tx.update(integrationRef, {
      "config.zatcaHashChain": params.chain,
      updatedAt: Timestamp.now(),
    });
  });
}

/**
 * Cross-tenant read — the only one in this file. Must only ever be called
 * from the CRON_SECRET-gated ZATCA cron routes (certificate-expiry,
 * reporting-sla), never from a company-scoped user request.
 */
export async function listAllActiveZatcaIntegrations() {
  const snapshot = await db
    .collection("integrations")
    .where("connector", "==", "zatca")
    .where("status", "==", "active")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name ?? data.connector,
      connector: data.connector ?? "custom",
      status: data.status ?? "inactive",
      environment: data.environment ?? "sandbox",
      config: data.config ?? {},
      credentials: readCredentials(data),
      lastSyncAt: data.lastSyncAt?.toDate ? data.lastSyncAt.toDate() : undefined,
      lastError: data.lastError ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as IntegrationRecord;
  });
}
