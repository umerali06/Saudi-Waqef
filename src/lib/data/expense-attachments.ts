import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AttachmentStorage = "cloudinary" | "firestore";

export type ExpenseAttachment = {
  id: string;
  companyId: string;
  expenseId: string;
  name: string;
  contentType: string;
  size: number;
  storage: AttachmentStorage;
  url?: string;
  content?: string;
  createdAt: Date;
};

export async function listExpenseAttachments(expenseId: string) {
  const snapshot = await db
    .collection("expense_attachments")
    .where("expenseId", "==", expenseId)
    .get();

  const attachments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      expenseId: data.expenseId,
      name: data.name,
      contentType: data.contentType,
      size: data.size ?? 0,
      storage: data.storage ?? "cloudinary",
      url: data.url ?? undefined,
      content: data.content ?? undefined,
      createdAt: data.createdAt.toDate(),
    } as ExpenseAttachment;
  });

  return attachments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getExpenseAttachment(attachmentId: string) {
  const doc = await db.collection("expense_attachments").doc(attachmentId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    expenseId: data.expenseId,
    name: data.name,
    contentType: data.contentType,
    size: data.size ?? 0,
    storage: data.storage ?? "cloudinary",
    url: data.url ?? undefined,
    content: data.content ?? undefined,
    createdAt: data.createdAt.toDate(),
  } as ExpenseAttachment;
}

export async function createExpenseAttachment(params: {
  companyId: string;
  expenseId: string;
  name: string;
  contentType: string;
  size: number;
  storage: AttachmentStorage;
  url?: string | null;
  content?: string | null;
}) {
  const id = uuidv4();
  await db.collection("expense_attachments").doc(id).set({
    companyId: params.companyId,
    expenseId: params.expenseId,
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

export async function deleteExpenseAttachment(attachmentId: string) {
  await db.collection("expense_attachments").doc(attachmentId).delete();
}
