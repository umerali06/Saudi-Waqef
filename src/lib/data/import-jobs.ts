import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type ImportEntity = "items" | "customers" | "vendors" | "opening_balances";
export type ImportJobStatus = "completed" | "completed_with_errors" | "failed";

export type ImportJob = {
  id: string;
  companyId: string;
  entity: ImportEntity;
  status: ImportJobStatus;
  totalRows: number;
  createdCount: number;
  errorCount: number;
  createdBy: string;
  createdByEmail?: string | null;
  createdAt: Date;
};

export async function listImportJobs(companyId: string, limitCount = 30) {
  const snapshot = await db
    .collection("import_jobs")
    .where("companyId", "==", companyId)
    .get();

  const jobs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      entity: data.entity ?? "items",
      status: data.status ?? "completed",
      totalRows: data.totalRows ?? 0,
      createdCount: data.createdCount ?? 0,
      errorCount: data.errorCount ?? 0,
      createdBy: data.createdBy,
      createdByEmail: data.createdByEmail ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as ImportJob;
  });

  return jobs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
}

export async function createImportJob(params: {
  companyId: string;
  entity: ImportEntity;
  status: ImportJobStatus;
  totalRows: number;
  createdCount: number;
  errorCount: number;
  createdBy: string;
  createdByEmail?: string | null;
}) {
  const id = uuidv4();
  await db.collection("import_jobs").doc(id).set({
    companyId: params.companyId,
    entity: params.entity,
    status: params.status,
    totalRows: params.totalRows,
    createdCount: params.createdCount,
    errorCount: params.errorCount,
    createdBy: params.createdBy,
    createdByEmail: params.createdByEmail ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
