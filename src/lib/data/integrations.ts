import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { decryptString, encryptString } from "@/lib/security/crypto";

const readCredentials = (data: Record<string, unknown>) => {
  if (typeof data.credentialsEnc === "string" && data.credentialsEnc) {
    return JSON.parse(decryptString(data.credentialsEnc)) as Record<string, unknown>;
  }
  return (data.credentials ?? {}) as Record<string, unknown>;
};

export type IntegrationConnector = "zatca" | "gosi" | "mudad" | "custom";
export type IntegrationStatus = "inactive" | "active" | "error";
export type IntegrationEnvironment = "sandbox" | "production";

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
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.credentials) {
    payload.credentialsEnc = encryptString(JSON.stringify(updates.credentials));
    delete payload.credentials;
    payload.credentials = null;
  }
  if (updates.lastSyncAt instanceof Date) {
    payload.lastSyncAt = Timestamp.fromDate(updates.lastSyncAt);
  }
  await db.collection("integrations").doc(integrationId).set(payload, { merge: true });
}
