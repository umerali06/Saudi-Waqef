import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AttendanceStatus = "present" | "late" | "absent" | "leave" | "holiday";
export type AttendanceSource = "manual" | "import" | "self";

export type AttendanceRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: AttendanceStatus;
  totalMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  source: AttendanceSource;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listAttendanceRecords(companyId: string) {
  const snapshot = await db
    .collection("attendance_records")
    .where("companyId", "==", companyId)
    .get();

  const records = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      employeeId: data.employeeId,
      date: data.date,
      checkIn: data.checkIn ?? null,
      checkOut: data.checkOut ?? null,
      status: (data.status ?? "present") as AttendanceStatus,
      totalMinutes: data.totalMinutes ?? 0,
      overtimeMinutes: data.overtimeMinutes ?? 0,
      lateMinutes: data.lateMinutes ?? 0,
      earlyMinutes: data.earlyMinutes ?? 0,
      source: (data.source ?? "manual") as AttendanceSource,
      notes: data.notes ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as AttendanceRecord;
  });

  return records.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAttendanceRecord(recordId: string) {
  const doc = await db.collection("attendance_records").doc(recordId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    employeeId: data.employeeId,
    date: data.date,
    checkIn: data.checkIn ?? null,
    checkOut: data.checkOut ?? null,
    status: (data.status ?? "present") as AttendanceStatus,
    totalMinutes: data.totalMinutes ?? 0,
    overtimeMinutes: data.overtimeMinutes ?? 0,
    lateMinutes: data.lateMinutes ?? 0,
    earlyMinutes: data.earlyMinutes ?? 0,
    source: (data.source ?? "manual") as AttendanceSource,
    notes: data.notes ?? null,
    createdBy: data.createdBy ?? null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as AttendanceRecord;
}

export async function findAttendanceRecord(params: {
  companyId: string;
  employeeId: string;
  date: string;
}) {
  const snapshot = await db
    .collection("attendance_records")
    .where("companyId", "==", params.companyId)
    .where("employeeId", "==", params.employeeId)
    .where("date", "==", params.date)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    companyId: data.companyId,
    employeeId: data.employeeId,
    date: data.date,
    checkIn: data.checkIn ?? null,
    checkOut: data.checkOut ?? null,
    status: (data.status ?? "present") as AttendanceStatus,
    totalMinutes: data.totalMinutes ?? 0,
    overtimeMinutes: data.overtimeMinutes ?? 0,
    lateMinutes: data.lateMinutes ?? 0,
    earlyMinutes: data.earlyMinutes ?? 0,
    source: (data.source ?? "manual") as AttendanceSource,
    notes: data.notes ?? null,
    createdBy: data.createdBy ?? null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as AttendanceRecord;
}

export async function createAttendanceRecord(params: {
  companyId: string;
  employeeId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: AttendanceStatus;
  totalMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  source: AttendanceSource;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const id = uuidv4();
  await db.collection("attendance_records").doc(id).set({
    companyId: params.companyId,
    employeeId: params.employeeId,
    date: params.date,
    checkIn: params.checkIn ?? null,
    checkOut: params.checkOut ?? null,
    status: params.status,
    totalMinutes: params.totalMinutes,
    overtimeMinutes: params.overtimeMinutes,
    lateMinutes: params.lateMinutes,
    earlyMinutes: params.earlyMinutes,
    source: params.source,
    notes: params.notes ?? null,
    createdBy: params.createdBy ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateAttendanceRecord(
  recordId: string,
  updates: Partial<
    Pick<
      AttendanceRecord,
      | "checkIn"
      | "checkOut"
      | "status"
      | "totalMinutes"
      | "overtimeMinutes"
      | "lateMinutes"
      | "earlyMinutes"
      | "notes"
    >
  >
) {
  await db.collection("attendance_records").doc(recordId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function deleteAttendanceRecord(recordId: string) {
  await db.collection("attendance_records").doc(recordId).delete();
}
