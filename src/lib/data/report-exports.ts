import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type ReportExportStatus = "success" | "failed";

export type ReportExport = {
  id: string;
  companyId: string;
  userId: string;
  userEmail?: string | null;
  reportType: string;
  format: string;
  status: ReportExportStatus;
  filters?: Record<string, unknown>;
  createdAt: Date;
};

export async function createReportExport(params: {
  companyId: string;
  userId: string;
  userEmail?: string | null;
  reportType: string;
  format: string;
  status?: ReportExportStatus;
  filters?: Record<string, unknown>;
}) {
  const id = uuidv4();
  await db.collection("report_exports").doc(id).set({
    companyId: params.companyId,
    userId: params.userId,
    userEmail: params.userEmail ?? null,
    reportType: params.reportType,
    format: params.format,
    status: params.status ?? "success",
    filters: params.filters ?? {},
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function listReportExports(params: {
  companyId: string;
  reportType?: string | null;
  format?: string | null;
  userId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
}) {
  const limit = params.limit && params.limit > 0 ? params.limit : 200;
  const snapshot = await db
    .collection("report_exports")
    .where("companyId", "==", params.companyId)
    .limit(limit)
    .get();

  const exports = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      userId: data.userId,
      userEmail: data.userEmail ?? null,
      reportType: data.reportType ?? "",
      format: data.format ?? "csv",
      status: (data.status ?? "success") as ReportExportStatus,
      filters: data.filters ?? {},
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as ReportExport;
  });

  let filtered = exports;
  if (params.reportType) {
    filtered = filtered.filter((entry) => entry.reportType === params.reportType);
  }
  if (params.format) {
    filtered = filtered.filter((entry) => entry.format === params.format);
  }
  if (params.userId) {
    filtered = filtered.filter((entry) => entry.userId === params.userId);
  }

  if (params.startDate || params.endDate) {
    const start = params.startDate ? new Date(`${params.startDate}T00:00:00Z`) : null;
    const end = params.endDate ? new Date(`${params.endDate}T23:59:59Z`) : null;
    filtered = filtered.filter((entry) => {
      const time = entry.createdAt.getTime();
      if (start && time < start.getTime()) {
        return false;
      }
      if (end && time > end.getTime()) {
        return false;
      }
      return true;
    });
  }

  return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
