import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type LeaveAdjustment = {
  id: string;
  companyId: string;
  employeeId: string;
  leaveTypeId: string;
  amount: number;
  reason: string;
  createdBy?: string | null;
  createdAt: Date;
};

export async function listLeaveAdjustments(companyId: string) {
  const snapshot = await db
    .collection("leave_adjustments")
    .where("companyId", "==", companyId)
    .get();

  const adjustments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      amount: data.amount ?? 0,
      reason: data.reason ?? "",
      createdBy: data.createdBy ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as LeaveAdjustment;
  });

  return adjustments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function createLeaveAdjustment(params: {
  companyId: string;
  employeeId: string;
  leaveTypeId: string;
  amount: number;
  reason: string;
  createdBy?: string | null;
}) {
  const id = uuidv4();
  await db.collection("leave_adjustments").doc(id).set({
    companyId: params.companyId,
    employeeId: params.employeeId,
    leaveTypeId: params.leaveTypeId,
    amount: params.amount,
    reason: params.reason.trim(),
    createdBy: params.createdBy ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
