import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AttachmentStorage = "cloudinary" | "firestore";

export type InvoiceAttachment = {
  id: string;
  companyId: string;
  invoiceId: string;
  name: string;
  contentType: string;
  size: number;
  storage: AttachmentStorage;
  url?: string;
  content?: string;
  createdAt: Date;
};

export async function listInvoiceAttachments(invoiceId: string) {
  const snapshot = await db
    .collection("invoice_attachments")
    .where("invoiceId", "==", invoiceId)
    .get();

  const attachments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      invoiceId: data.invoiceId,
      name: data.name,
      contentType: data.contentType,
      size: data.size ?? 0,
      storage: data.storage ?? "cloudinary",
      url: data.url ?? undefined,
      content: data.content ?? undefined,
      createdAt: data.createdAt.toDate(),
    } as InvoiceAttachment;
  });

  return attachments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getInvoiceAttachment(attachmentId: string) {
  const doc = await db.collection("invoice_attachments").doc(attachmentId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    invoiceId: data.invoiceId,
    name: data.name,
    contentType: data.contentType,
    size: data.size ?? 0,
    storage: data.storage ?? "cloudinary",
    url: data.url ?? undefined,
    content: data.content ?? undefined,
    createdAt: data.createdAt.toDate(),
  } as InvoiceAttachment;
}

export async function createInvoiceAttachment(params: {
  companyId: string;
  invoiceId: string;
  name: string;
  contentType: string;
  size: number;
  storage: AttachmentStorage;
  url?: string | null;
  content?: string | null;
}) {
  const id = uuidv4();
  await db.collection("invoice_attachments").doc(id).set({
    companyId: params.companyId,
    invoiceId: params.invoiceId,
    name: params.name.trim(),
    contentType: params.contentType,
    size: params.size,
    storage: params.storage,
    url: params.url ?? null,
    content: params.content ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function deleteInvoiceAttachment(attachmentId: string) {
  await db.collection("invoice_attachments").doc(attachmentId).delete();
}
