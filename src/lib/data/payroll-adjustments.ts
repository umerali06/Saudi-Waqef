import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type PayrollAdjustment = {
  id: string;
  companyId: string;
  runId: string;
  runItemId: string;
  amount: number;
  reason: string;
  createdBy?: string | null;
  createdAt: Date;
};

export async function listPayrollAdjustments(runId: string) {
  const snapshot = await db
    .collection("payroll_adjustments")
    .where("runId", "==", runId)
    .get();

  const adjustments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      runId: data.runId,
      runItemId: data.runItemId,
      amount: data.amount ?? 0,
      reason: data.reason ?? "",
      createdBy: data.createdBy ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as PayrollAdjustment;
  });

  return adjustments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function createPayrollAdjustment(params: {
  companyId: string;
  runId: string;
  runItemId: string;
  amount: number;
  reason: string;
  createdBy?: string | null;
}) {
  const id = uuidv4();
  await db.collection("payroll_adjustments").doc(id).set({
    companyId: params.companyId,
    runId: params.runId,
    runItemId: params.runItemId,
    amount: params.amount,
    reason: params.reason.trim(),
    createdBy: params.createdBy ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
