import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type ApiKeyScope =
  | "read:accounting"
  | "write:accounting"
  | "read:hr"
  | "write:hr"
  | "read:reports"
  | "write:reports"
  | "read:settings"
  | "write:settings";

export type ApiKeyRecord = {
  id: string;
  companyId: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  status: "active" | "revoked";
  createdBy: string;
  createdByEmail?: string | null;
  createdAt: Date;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
};

export type ApiKeyUsage = {
  id: string;
  companyId: string;
  keyId: string;
  endpoint: string;
  method: string;
  status: number;
  error?: string | null;
  createdAt: Date;
};

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const generateToken = () => crypto.randomBytes(32).toString("base64url");

const toDate = (value?: { toDate?: () => Date } | null) =>
  value?.toDate ? value.toDate() : null;

export async function listApiKeys(companyId: string) {
  const snapshot = await db
    .collection("api_keys")
    .where("companyId", "==", companyId)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name ?? "",
      prefix: data.prefix ?? "",
      scopes: (data.scopes ?? []) as ApiKeyScope[],
      status: (data.status ?? "active") as ApiKeyRecord["status"],
      createdBy: data.createdBy ?? "",
      createdByEmail: data.createdByEmail ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      revokedAt: toDate(data.revokedAt),
      lastUsedAt: toDate(data.lastUsedAt),
    } as ApiKeyRecord;
  });
}

export async function createApiKey(params: {
  companyId: string;
  name: string;
  scopes: ApiKeyScope[];
  createdBy: string;
  createdByEmail?: string | null;
}) {
  const id = uuidv4();
  const token = generateToken();
  const prefix = token.slice(0, 6);
  const tokenHash = hashToken(token);

  await db.collection("api_keys").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    prefix,
    scopes: params.scopes,
    status: "active",
    tokenHash,
    createdBy: params.createdBy,
    createdByEmail: params.createdByEmail ?? null,
    createdAt: Timestamp.now(),
  });

  return { id, token, prefix };
}

export async function revokeApiKey(keyId: string) {
  await db.collection("api_keys").doc(keyId).set(
    {
      status: "revoked",
      revokedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function verifyApiKey(token: string) {
  const tokenHash = hashToken(token);
  const snapshot = await db
    .collection("api_keys")
    .where("tokenHash", "==", tokenHash)
    .limit(1)
    .get();
  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0];
  const data = doc.data();
  if ((data.status ?? "active") !== "active") {
    return null;
  }
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name ?? "",
    prefix: data.prefix ?? "",
    scopes: (data.scopes ?? []) as ApiKeyScope[],
  } as ApiKeyRecord;
}

export async function updateApiKeyLastUsed(keyId: string) {
  await db.collection("api_keys").doc(keyId).set(
    {
      lastUsedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function logApiKeyUsage(params: {
  companyId: string;
  keyId: string;
  endpoint: string;
  method: string;
  status: number;
  error?: string | null;
}) {
  const id = uuidv4();
  await db.collection("api_key_usage").doc(id).set({
    companyId: params.companyId,
    keyId: params.keyId,
    endpoint: params.endpoint,
    method: params.method,
    status: params.status,
    error: params.error ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function listApiKeyUsage(companyId: string, limitCount = 50) {
  const snapshot = await db
    .collection("api_key_usage")
    .where("companyId", "==", companyId)
    .get();
  const entries = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      keyId: data.keyId,
      endpoint: data.endpoint ?? "",
      method: data.method ?? "",
      status: data.status ?? 0,
      error: data.error ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as ApiKeyUsage;
  });
  return entries
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
}
