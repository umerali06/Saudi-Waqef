import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type ZatcaArtifact = {
  id: string;
  companyId: string;
  invoiceId: string;
  uuid: string;
  hash: string;
  qr: string;
  payload: Record<string, unknown>;
  status?: "pending" | "submitted" | "accepted" | "rejected";
  providerReference?: string | null;
  lastSubmittedAt?: Date | null;
  lastResponse?: Record<string, unknown> | null;
  /** 24h ZATCA B2C reporting deadline, computed from the document's issuance time. Null for B2B/clearance documents (no SLA). */
  reportingDueAt?: Date | null;
  /** Set once an at-risk/breached reporting SLA alert has fired, to avoid re-alerting every cron tick. */
  slaAlertedAt?: Date | null;
  createdAt: Date;
};

export async function getZatcaArtifactByInvoiceId(invoiceId: string) {
  const snapshot = await db
    .collection("zatca_artifacts")
    .where("invoiceId", "==", invoiceId)
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
    invoiceId: data.invoiceId,
    uuid: data.uuid,
    hash: data.hash,
    qr: data.qr,
    payload: data.payload ?? {},
    status: data.status ?? "pending",
    providerReference: data.providerReference ?? null,
    lastSubmittedAt: data.lastSubmittedAt?.toDate ? data.lastSubmittedAt.toDate() : null,
    lastResponse:
      data.lastResponse && typeof data.lastResponse === "object" ? data.lastResponse : null,
    reportingDueAt: data.reportingDueAt?.toDate ? data.reportingDueAt.toDate() : null,
    slaAlertedAt: data.slaAlertedAt?.toDate ? data.slaAlertedAt.toDate() : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as ZatcaArtifact;
}

export async function createZatcaArtifact(params: {
  companyId: string;
  invoiceId: string;
  uuid: string;
  hash: string;
  qr: string;
  payload: Record<string, unknown>;
  status?: "pending" | "submitted" | "accepted" | "rejected";
  reportingDueAt?: Date | null;
}) {
  const id = uuidv4();
  await db.collection("zatca_artifacts").doc(id).set({
    companyId: params.companyId,
    invoiceId: params.invoiceId,
    uuid: params.uuid,
    hash: params.hash,
    qr: params.qr,
    payload: params.payload,
    status: params.status ?? "pending",
    providerReference: null,
    lastSubmittedAt: null,
    lastResponse: null,
    reportingDueAt: params.reportingDueAt ? Timestamp.fromDate(params.reportingDueAt) : null,
    slaAlertedAt: null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function getZatcaArtifactByUuid(companyId: string, uuid: string) {
  const snapshot = await db
    .collection("zatca_artifacts")
    .where("companyId", "==", companyId)
    .where("uuid", "==", uuid)
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
    invoiceId: data.invoiceId,
    uuid: data.uuid,
    hash: data.hash,
    qr: data.qr,
    payload: data.payload ?? {},
    status: data.status ?? "pending",
    providerReference: data.providerReference ?? null,
    lastSubmittedAt: data.lastSubmittedAt?.toDate ? data.lastSubmittedAt.toDate() : null,
    lastResponse:
      data.lastResponse && typeof data.lastResponse === "object" ? data.lastResponse : null,
    reportingDueAt: data.reportingDueAt?.toDate ? data.reportingDueAt.toDate() : null,
    slaAlertedAt: data.slaAlertedAt?.toDate ? data.slaAlertedAt.toDate() : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as ZatcaArtifact;
}

export async function updateZatcaArtifactStatus(
  artifactId: string,
  updates: {
    status?: "pending" | "submitted" | "accepted" | "rejected";
    providerReference?: string | null;
    lastSubmittedAt?: Date | null;
    lastResponse?: Record<string, unknown> | null;
    slaAlertedAt?: Date | null;
  }
) {
  const payload: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };
  if (updates.status) {
    payload.status = updates.status;
  }
  if (updates.providerReference !== undefined) {
    payload.providerReference = updates.providerReference;
  }
  if (updates.lastSubmittedAt !== undefined) {
    payload.lastSubmittedAt = updates.lastSubmittedAt
      ? Timestamp.fromDate(updates.lastSubmittedAt)
      : null;
  }
  if (updates.lastResponse !== undefined) {
    payload.lastResponse = updates.lastResponse ?? null;
  }
  if (updates.slaAlertedAt !== undefined) {
    payload.slaAlertedAt = updates.slaAlertedAt ? Timestamp.fromDate(updates.slaAlertedAt) : null;
  }
  await db.collection("zatca_artifacts").doc(artifactId).set(payload, { merge: true });
}

/**
 * Artifacts whose 24h ZATCA B2C reporting deadline falls within `withinMs`
 * from now and haven't been alerted on yet. Filters in-memory after a status
 * fetch (acceptable at current volume) — add a composite (status, reportingDueAt)
 * index if artifact volume grows enough to make this a scaling concern.
 */
export async function listAtRiskReportingArtifacts(withinMs: number) {
  const snapshot = await db
    .collection("zatca_artifacts")
    .where("status", "in", ["pending", "submitted", "rejected"])
    .get();

  const cutoff = Date.now() + withinMs;
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        companyId: data.companyId,
        invoiceId: data.invoiceId,
        uuid: data.uuid,
        hash: data.hash,
        qr: data.qr,
        payload: data.payload ?? {},
        status: data.status ?? "pending",
        providerReference: data.providerReference ?? null,
        lastSubmittedAt: data.lastSubmittedAt?.toDate ? data.lastSubmittedAt.toDate() : null,
        lastResponse:
          data.lastResponse && typeof data.lastResponse === "object" ? data.lastResponse : null,
        reportingDueAt: data.reportingDueAt?.toDate ? data.reportingDueAt.toDate() : null,
        slaAlertedAt: data.slaAlertedAt?.toDate ? data.slaAlertedAt.toDate() : null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      } as ZatcaArtifact;
    })
    .filter((artifact) => artifact.reportingDueAt && artifact.reportingDueAt.getTime() <= cutoff && !artifact.slaAlertedAt);
}

export async function listZatcaArtifactsByCompany(companyId: string, limitCount = 100) {
  const snapshot = await db
    .collection("zatca_artifacts")
    .where("companyId", "==", companyId)
    .get();

  const artifacts = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      invoiceId: data.invoiceId,
      uuid: data.uuid,
      hash: data.hash,
      qr: data.qr,
      payload: data.payload ?? {},
      status: data.status ?? "pending",
      providerReference: data.providerReference ?? null,
      lastSubmittedAt: data.lastSubmittedAt?.toDate ? data.lastSubmittedAt.toDate() : null,
      lastResponse:
        data.lastResponse && typeof data.lastResponse === "object" ? data.lastResponse : null,
      reportingDueAt: data.reportingDueAt?.toDate ? data.reportingDueAt.toDate() : null,
      slaAlertedAt: data.slaAlertedAt?.toDate ? data.slaAlertedAt.toDate() : null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as ZatcaArtifact;
  });

  return artifacts
    .sort((a, b) => {
      const aTs = a.lastSubmittedAt?.getTime() ?? a.createdAt.getTime();
      const bTs = b.lastSubmittedAt?.getTime() ?? b.createdAt.getTime();
      return bTs - aTs;
    })
    .slice(0, limitCount);
}
