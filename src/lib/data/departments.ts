import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type DepartmentStatus = "active" | "inactive";

export type DepartmentRecord = {
  id: string;
  companyId: string;
  nameAr: string;
  nameEn: string;
  code?: string | null;
  managerId?: string | null;
  status: DepartmentStatus;
  notes?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listDepartments(companyId: string) {
  const snapshot = await db
    .collection("departments")
    .where("companyId", "==", companyId)
    .get();

  const departments = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      nameAr: data.nameAr ?? "",
      nameEn: data.nameEn ?? "",
      code: data.code ?? null,
      managerId: data.managerId ?? null,
      status: data.status ?? "active",
      notes: data.notes ?? null,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as DepartmentRecord;
  });

  return departments.sort((a, b) => {
    const aName = a.nameEn || a.nameAr;
    const bName = b.nameEn || b.nameAr;
    return aName.localeCompare(bName);
  });
}

export async function getDepartmentById(departmentId: string) {
  const doc = await db.collection("departments").doc(departmentId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    nameAr: data.nameAr ?? "",
    nameEn: data.nameEn ?? "",
    code: data.code ?? null,
    managerId: data.managerId ?? null,
    status: data.status ?? "active",
    notes: data.notes ?? null,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  } as DepartmentRecord;
}

export async function createDepartment(params: {
  companyId: string;
  nameAr: string;
  nameEn: string;
  code?: string | null;
  managerId?: string | null;
  status?: DepartmentStatus;
  notes?: string | null;
}) {
  const id = uuidv4();
  await db.collection("departments").doc(id).set({
    companyId: params.companyId,
    nameAr: params.nameAr.trim(),
    nameEn: params.nameEn.trim(),
    nameArNormalized: normalizeSearch(params.nameAr),
    nameEnNormalized: normalizeSearch(params.nameEn),
    code: params.code ?? null,
    managerId: params.managerId ?? null,
    status: params.status ?? "active",
    notes: params.notes ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateDepartment(
  departmentId: string,
  updates: Partial<{
    nameAr: string;
    nameEn: string;
    code: string | null;
    managerId: string | null;
    status: DepartmentStatus;
    notes: string | null;
  }>
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.nameAr) {
    payload.nameArNormalized = normalizeSearch(updates.nameAr);
  }
  if (updates.nameEn) {
    payload.nameEnNormalized = normalizeSearch(updates.nameEn);
  }
  await db.collection("departments").doc(departmentId).set(payload, { merge: true });
}
