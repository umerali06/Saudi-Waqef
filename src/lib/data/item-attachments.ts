import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AttachmentStorage = "cloudinary" | "firestore";

export type ItemAttachment = {
  id: string;
  companyId: string;
  itemId: string;
  name: string;
  contentType: string;
  size: number;
  storage: AttachmentStorage;
  url?: string;
  content?: string;
  createdAt: Date;
};

export async function listItemAttachments(itemId: string) {
  const snapshot = await db
    .collection("item_attachments")
    .where("itemId", "==", itemId)
    .get();

  const attachments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      itemId: data.itemId,
      name: data.name,
      contentType: data.contentType,
      size: data.size ?? 0,
      storage: data.storage ?? "cloudinary",
      url: data.url ?? undefined,
      content: data.content ?? undefined,
      createdAt: data.createdAt.toDate(),
    } as ItemAttachment;
  });

  return attachments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getItemAttachment(attachmentId: string) {
  const doc = await db.collection("item_attachments").doc(attachmentId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    itemId: data.itemId,
    name: data.name,
    contentType: data.contentType,
    size: data.size ?? 0,
    storage: data.storage ?? "cloudinary",
    url: data.url ?? undefined,
    content: data.content ?? undefined,
    createdAt: data.createdAt.toDate(),
  } as ItemAttachment;
}

export async function createItemAttachment(params: {
  companyId: string;
  itemId: string;
  name: string;
  contentType: string;
  size: number;
  storage: AttachmentStorage;
  url?: string | null;
  content?: string | null;
}) {
  const id = uuidv4();
  await db.collection("item_attachments").doc(id).set({
    companyId: params.companyId,
    itemId: params.itemId,
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

export async function deleteItemAttachment(attachmentId: string) {
  await db.collection("item_attachments").doc(attachmentId).delete();
}
