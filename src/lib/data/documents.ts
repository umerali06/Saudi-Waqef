import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type DocumentStorage = "cloudinary" | "firestore";

export type DocumentVersion = {
  id: string;
  contentType: string;
  size: number;
  storage: DocumentStorage;
  url?: string | null;
  content?: string | null;
  replacedAt: Date;
  replacedBy?: string | null;
};

export type DocumentRecord = {
  id: string;
  companyId: string;
  name: string;
  docType: "invoice" | "receipt" | "contract" | "id" | "general";
  tags: string[];
  entityType?: string | null;
  entityId?: string | null;
  contentType: string;
  size: number;
  storage: DocumentStorage;
  url?: string | null;
  content?: string | null;
  uploadedBy: string;
  uploadedByEmail?: string | null;
  versions?: DocumentVersion[];
  createdAt: Date;
  updatedAt?: Date;
};

const normalizeTags = (tags?: string[] | null) =>
  (tags ?? []).map((tag) => tag.trim()).filter(Boolean);

export async function listDocuments(companyId: string) {
  const snapshot = await db
    .collection("documents")
    .where("companyId", "==", companyId)
    .get();

  const docs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name,
      docType: data.docType ?? "general",
      tags: data.tags ?? [],
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      contentType: data.contentType ?? "application/octet-stream",
      size: data.size ?? 0,
      storage: data.storage ?? "cloudinary",
      url: data.url ?? null,
      content: data.content ?? null,
      uploadedBy: data.uploadedBy,
      uploadedByEmail: data.uploadedByEmail ?? null,
      versions: (data.versions ?? []).map((version: DocumentVersion) => ({
        ...version,
        replacedAt: version.replacedAt?.toDate
          ? version.replacedAt.toDate()
          : new Date(),
      })),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as DocumentRecord;
  });

  return docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getDocumentById(documentId: string) {
  const doc = await db.collection("documents").doc(documentId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name,
    docType: data.docType ?? "general",
    tags: data.tags ?? [],
    entityType: data.entityType ?? null,
    entityId: data.entityId ?? null,
    contentType: data.contentType ?? "application/octet-stream",
    size: data.size ?? 0,
    storage: data.storage ?? "cloudinary",
    url: data.url ?? null,
    content: data.content ?? null,
    uploadedBy: data.uploadedBy,
    uploadedByEmail: data.uploadedByEmail ?? null,
    versions: (data.versions ?? []).map((version: DocumentVersion) => ({
      ...version,
      replacedAt: version.replacedAt?.toDate
        ? version.replacedAt.toDate()
        : new Date(),
    })),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as DocumentRecord;
}

export async function createDocument(params: {
  companyId: string;
  name: string;
  docType: DocumentRecord["docType"];
  tags?: string[] | null;
  entityType?: string | null;
  entityId?: string | null;
  contentType: string;
  size: number;
  storage: DocumentStorage;
  url?: string | null;
  content?: string | null;
  uploadedBy: string;
  uploadedByEmail?: string | null;
}) {
  const id = uuidv4();
  await db.collection("documents").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    docType: params.docType ?? "general",
    tags: normalizeTags(params.tags),
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    contentType: params.contentType,
    size: params.size,
    storage: params.storage,
    url: params.url ?? null,
    content: params.content ?? null,
    uploadedBy: params.uploadedBy,
    uploadedByEmail: params.uploadedByEmail ?? null,
    versions: [],
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: Partial<{
    name: string;
    docType: DocumentRecord["docType"];
    tags: string[];
    entityType: string | null;
    entityId: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.tags) {
    payload.tags = normalizeTags(updates.tags);
  }
  await db.collection("documents").doc(documentId).set(payload, { merge: true });
}

export async function replaceDocument(params: {
  documentId: string;
  contentType: string;
  size: number;
  storage: DocumentStorage;
  url?: string | null;
  content?: string | null;
  replacedBy?: string | null;
}) {
  const existing = await getDocumentById(params.documentId);
  if (!existing) {
    return null;
  }

  const version: DocumentVersion = {
    id: uuidv4(),
    contentType: existing.contentType,
    size: existing.size,
    storage: existing.storage,
    url: existing.url ?? null,
    content: existing.content ?? null,
    replacedAt: new Date(),
    replacedBy: params.replacedBy ?? null,
  };

  const versions = [version, ...(existing.versions ?? [])].slice(0, 3);

  await db.collection("documents").doc(params.documentId).set(
    {
      contentType: params.contentType,
      size: params.size,
      storage: params.storage,
      url: params.url ?? null,
      content: params.content ?? null,
      versions,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  return await getDocumentById(params.documentId);
}

export async function deleteDocument(documentId: string) {
  await db.collection("documents").doc(documentId).delete();
}
