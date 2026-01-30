import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type LeaveTypeStatus = "active" | "inactive";

export type LeaveType = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  isPaid: boolean;
  defaultAllowance: number;
  requiresApproval: boolean;
  status: LeaveTypeStatus;
  createdAt: Date;
};

export async function listLeaveTypes(companyId: string) {
  const snapshot = await db
    .collection("leave_types")
    .where("companyId", "==", companyId)
    .get();

  const types = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name ?? "",
      code: data.code ?? "",
      isPaid: Boolean(data.isPaid),
      defaultAllowance: data.defaultAllowance ?? 0,
      requiresApproval: Boolean(data.requiresApproval ?? true),
      status: (data.status ?? "active") as LeaveTypeStatus,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as LeaveType;
  });

  return types.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createLeaveType(params: {
  companyId: string;
  name: string;
  code: string;
  isPaid: boolean;
  defaultAllowance: number;
  requiresApproval: boolean;
  status?: LeaveTypeStatus;
}) {
  const id = uuidv4();
  await db.collection("leave_types").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    nameNormalized: normalizeSearch(params.name),
    code: params.code.trim().toUpperCase(),
    codeNormalized: normalizeSearch(params.code),
    isPaid: params.isPaid,
    defaultAllowance: params.defaultAllowance,
    requiresApproval: params.requiresApproval,
    status: params.status ?? "active",
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateLeaveType(
  typeId: string,
  updates: Partial<
    Pick<
      LeaveType,
      "name" | "code" | "isPaid" | "defaultAllowance" | "requiresApproval" | "status"
    >
  >
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.name) {
    payload.nameNormalized = normalizeSearch(updates.name);
  }
  if (updates.code) {
    payload.code = updates.code.trim().toUpperCase();
    payload.codeNormalized = normalizeSearch(updates.code);
  }
  await db.collection("leave_types").doc(typeId).set(payload, { merge: true });
}

export async function deleteLeaveType(typeId: string) {
  await db.collection("leave_types").doc(typeId).delete();
}
