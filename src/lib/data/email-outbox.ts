import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type OutboxStatus = "queued" | "sending" | "sent" | "failed";

export type OutboxEmail = {
  id: string;
  companyId: string;
  to: string;
  subject: string;
  body: string;
  sourceType?: string | null;
  sourceId?: string | null;
  meta?: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  lastError?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function queueEmail(params: {
  companyId: string;
  to: string;
  subject: string;
  body: string;
  sourceType?: string | null;
  sourceId?: string | null;
  meta?: Record<string, unknown>;
}) {
  const id = uuidv4();
  await db.collection("email_outbox").doc(id).set({
    companyId: params.companyId,
    to: params.to,
    subject: params.subject,
    body: params.body,
    sourceType: params.sourceType ?? null,
    sourceId: params.sourceId ?? null,
    meta: params.meta ?? {},
    status: "queued",
    attempts: 0,
    lastError: null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function getOutboxEmail(id: string) {
  const doc = await db.collection("email_outbox").doc(id).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    to: data.to,
    subject: data.subject,
    body: data.body,
    sourceType: data.sourceType ?? null,
    sourceId: data.sourceId ?? null,
    meta: data.meta ?? {},
    status: (data.status ?? "queued") as OutboxStatus,
    attempts: data.attempts ?? 0,
    lastError: data.lastError ?? null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as OutboxEmail;
}

export async function listOutboxEmails(params: {
  status: OutboxStatus;
  limit?: number;
  maxAttempts?: number;
}) {
  const limit = params.limit && params.limit > 0 ? params.limit : 25;
  const snapshot = await db
    .collection("email_outbox")
    .where("status", "==", params.status)
    .limit(limit)
    .get();

  const emails = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      to: data.to,
      subject: data.subject,
      body: data.body,
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
      meta: data.meta ?? {},
      status: (data.status ?? "queued") as OutboxStatus,
      attempts: data.attempts ?? 0,
      lastError: data.lastError ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as OutboxEmail;
  });

  const maxAttempts = params.maxAttempts;
  if (typeof maxAttempts === "number") {
    return emails.filter((email) => email.attempts < maxAttempts);
  }
  return emails;
}

export async function listOutboxEmailsBySource(params: {
  companyId: string;
  sourceType: string;
  sourceId: string;
  limit?: number;
}) {
  const limit = params.limit && params.limit > 0 ? params.limit : 25;
  const snapshot = await db
    .collection("email_outbox")
    .where("companyId", "==", params.companyId)
    .where("sourceType", "==", params.sourceType)
    .where("sourceId", "==", params.sourceId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      to: data.to,
      subject: data.subject,
      body: data.body,
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
      meta: data.meta ?? {},
      status: (data.status ?? "queued") as OutboxStatus,
      attempts: data.attempts ?? 0,
      lastError: data.lastError ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as OutboxEmail;
  });
}

export async function updateOutboxStatus(params: {
  id: string;
  status: OutboxStatus;
  attempts?: number;
  lastError?: string | null;
}) {
  await db.collection("email_outbox").doc(params.id).set(
    {
      status: params.status,
      attempts: params.attempts,
      lastError: params.lastError ?? null,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
