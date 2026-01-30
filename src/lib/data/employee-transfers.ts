import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type EmployeeTransferRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  fromDepartmentId?: string | null;
  toDepartmentId?: string | null;
  fromPositionId?: string | null;
  toPositionId?: string | null;
  effectiveDate?: string | null;
  reason?: string | null;
  createdBy?: string | null;
  createdAt: Date;
};

export async function listEmployeeTransfers(employeeId: string) {
  const snapshot = await db
    .collection("employee_transfers")
    .where("employeeId", "==", employeeId)
    .get();

  const transfers = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      employeeId: data.employeeId,
      fromDepartmentId: data.fromDepartmentId ?? null,
      toDepartmentId: data.toDepartmentId ?? null,
      fromPositionId: data.fromPositionId ?? null,
      toPositionId: data.toPositionId ?? null,
      effectiveDate: data.effectiveDate ?? null,
      reason: data.reason ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: data.createdAt.toDate(),
    } as EmployeeTransferRecord;
  });

  return transfers.sort((a, b) => {
    const aDate = a.effectiveDate ?? "";
    const bDate = b.effectiveDate ?? "";
    return bDate.localeCompare(aDate);
  });
}

export async function createEmployeeTransfer(params: {
  companyId: string;
  employeeId: string;
  fromDepartmentId?: string | null;
  toDepartmentId?: string | null;
  fromPositionId?: string | null;
  toPositionId?: string | null;
  effectiveDate?: string | null;
  reason?: string | null;
  createdBy?: string | null;
}) {
  const id = uuidv4();
  await db.collection("employee_transfers").doc(id).set({
    companyId: params.companyId,
    employeeId: params.employeeId,
    fromDepartmentId: params.fromDepartmentId ?? null,
    toDepartmentId: params.toDepartmentId ?? null,
    fromPositionId: params.fromPositionId ?? null,
    toPositionId: params.toPositionId ?? null,
    effectiveDate: params.effectiveDate ?? null,
    reason: params.reason ?? null,
    createdBy: params.createdBy ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}
