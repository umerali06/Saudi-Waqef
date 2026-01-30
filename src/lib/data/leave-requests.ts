import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequest = {
  id: string;
  companyId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  status: LeaveRequestStatus;
  approvedBy?: string | null;
  decidedAt?: Date | null;
  createdAt: Date;
};

export async function listLeaveRequests(companyId: string) {
  const snapshot = await db
    .collection("leave_requests")
    .where("companyId", "==", companyId)
    .get();

  const requests = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      startDate: data.startDate,
      endDate: data.endDate,
      days: data.days ?? 0,
      reason: data.reason ?? null,
      status: (data.status ?? "pending") as LeaveRequestStatus,
      approvedBy: data.approvedBy ?? null,
      decidedAt: data.decidedAt?.toDate ? data.decidedAt.toDate() : null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as LeaveRequest;
  });

  return requests.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export async function getLeaveRequest(requestId: string) {
  const doc = await db.collection("leave_requests").doc(requestId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    employeeId: data.employeeId,
    leaveTypeId: data.leaveTypeId,
    startDate: data.startDate,
    endDate: data.endDate,
    days: data.days ?? 0,
    reason: data.reason ?? null,
    status: (data.status ?? "pending") as LeaveRequestStatus,
    approvedBy: data.approvedBy ?? null,
    decidedAt: data.decidedAt?.toDate ? data.decidedAt.toDate() : null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  } as LeaveRequest;
}

export async function createLeaveRequest(params: {
  companyId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  status?: LeaveRequestStatus;
  approvedBy?: string | null;
  decidedAt?: Date | null;
}) {
  const id = uuidv4();
  await db.collection("leave_requests").doc(id).set({
    companyId: params.companyId,
    employeeId: params.employeeId,
    leaveTypeId: params.leaveTypeId,
    startDate: params.startDate,
    endDate: params.endDate,
    days: params.days,
    reason: params.reason ?? null,
    status: params.status ?? "pending",
    approvedBy: params.approvedBy ?? null,
    decidedAt: params.decidedAt ? Timestamp.fromDate(params.decidedAt) : null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateLeaveRequest(
  requestId: string,
  updates: Partial<{
    status: LeaveRequestStatus;
    approvedBy: string | null;
    decidedAt: Date | null;
    reason: string | null;
  }>
) {
  await db.collection("leave_requests").doc(requestId).set(
    {
      ...updates,
      decidedAt: updates.decidedAt ? Timestamp.fromDate(updates.decidedAt) : updates.decidedAt,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
