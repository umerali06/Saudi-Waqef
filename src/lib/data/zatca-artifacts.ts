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
}) {
  const id = uuidv4();
  await db.collection("zatca_artifacts").doc(id).set({
    companyId: params.companyId,
    invoiceId: params.invoiceId,
    uuid: params.uuid,
    hash: params.hash,
    qr: params.qr,
    payload: params.payload,
    createdAt: Timestamp.now(),
  });
  return id;
}
