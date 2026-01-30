import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type PositionStatus = "active" | "inactive";

export type PositionRecord = {
  id: string;
  companyId: string;
  nameAr: string;
  nameEn: string;
  code?: string | null;
  departmentId?: string | null;
  status: PositionStatus;
  notes?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listPositions(companyId: string) {
  const snapshot = await db
    .collection("positions")
    .where("companyId", "==", companyId)
    .get();

  const positions = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      nameAr: data.nameAr ?? "",
      nameEn: data.nameEn ?? "",
      code: data.code ?? null,
      departmentId: data.departmentId ?? null,
      status: data.status ?? "active",
      notes: data.notes ?? null,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as PositionRecord;
  });

  return positions.sort((a, b) => {
    const aName = a.nameEn || a.nameAr;
    const bName = b.nameEn || b.nameAr;
    return aName.localeCompare(bName);
  });
}

export async function getPositionById(positionId: string) {
  const doc = await db.collection("positions").doc(positionId).get();
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
    departmentId: data.departmentId ?? null,
    status: data.status ?? "active",
    notes: data.notes ?? null,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  } as PositionRecord;
}

export async function createPosition(params: {
  companyId: string;
  nameAr: string;
  nameEn: string;
  code?: string | null;
  departmentId?: string | null;
  status?: PositionStatus;
  notes?: string | null;
}) {
  const id = uuidv4();
  await db.collection("positions").doc(id).set({
    companyId: params.companyId,
    nameAr: params.nameAr.trim(),
    nameEn: params.nameEn.trim(),
    nameArNormalized: normalizeSearch(params.nameAr),
    nameEnNormalized: normalizeSearch(params.nameEn),
    code: params.code ?? null,
    departmentId: params.departmentId ?? null,
    status: params.status ?? "active",
    notes: params.notes ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updatePosition(
  positionId: string,
  updates: Partial<{
    nameAr: string;
    nameEn: string;
    code: string | null;
    departmentId: string | null;
    status: PositionStatus;
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
  await db.collection("positions").doc(positionId).set(payload, { merge: true });
}
