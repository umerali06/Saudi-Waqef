import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type DocumentStorage = "cloudinary" | "firestore";
export type DocumentType = "id" | "contract" | "certificate" | "other";

export type EmployeeDocumentRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  type: DocumentType;
  name: string;
  contentType: string;
  size: number;
  storage: DocumentStorage;
  url?: string;
  content?: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  createdAt: Date;
};

export async function listEmployeeDocuments(employeeId: string) {
  const snapshot = await db
    .collection("employee_documents")
    .where("employeeId", "==", employeeId)
    .get();

  const documents = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      employeeId: data.employeeId,
      type: data.type ?? "other",
      name: data.name ?? "",
      contentType: data.contentType ?? "application/octet-stream",
      size: data.size ?? 0,
      storage: data.storage ?? "cloudinary",
      url: data.url ?? undefined,
      content: data.content ?? undefined,
      issuedAt: data.issuedAt ?? null,
      expiresAt: data.expiresAt ?? null,
      createdAt: data.createdAt.toDate(),
    } as EmployeeDocumentRecord;
  });

  return documents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getEmployeeDocument(documentId: string) {
  const doc = await db.collection("employee_documents").doc(documentId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    employeeId: data.employeeId,
    type: data.type ?? "other",
    name: data.name ?? "",
    contentType: data.contentType ?? "application/octet-stream",
    size: data.size ?? 0,
    storage: data.storage ?? "cloudinary",
    url: data.url ?? undefined,
    content: data.content ?? undefined,
    issuedAt: data.issuedAt ?? null,
    expiresAt: data.expiresAt ?? null,
    createdAt: data.createdAt.toDate(),
  } as EmployeeDocumentRecord;
}

export async function createEmployeeDocument(params: {
  companyId: string;
  employeeId: string;
  type: DocumentType;
  name: string;
  contentType: string;
  size: number;
  storage: DocumentStorage;
  url?: string | null;
  content?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
}) {
  const id = uuidv4();
  await db.collection("employee_documents").doc(id).set({
    companyId: params.companyId,
    employeeId: params.employeeId,
    type: params.type,
    name: params.name.trim(),
    contentType: params.contentType,
    size: params.size,
    storage: params.storage,
    url: params.url ?? null,
    content: params.content ?? null,
    issuedAt: params.issuedAt ?? null,
    expiresAt: params.expiresAt ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function deleteEmployeeDocument(documentId: string) {
  await db.collection("employee_documents").doc(documentId).delete();
}
