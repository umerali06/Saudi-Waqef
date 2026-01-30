import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type AttendanceSettings = {
  companyId: string;
  shiftStart: string;
  shiftEnd: string;
  weekendDays: number[];
  graceMinutes: number;
  roundingMinutes: number;
  overtimeThresholdMinutes: number;
  createdAt: Date;
  updatedAt?: Date;
};

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  companyId: "",
  shiftStart: "09:00",
  shiftEnd: "17:00",
  weekendDays: [5, 6],
  graceMinutes: 10,
  roundingMinutes: 15,
  overtimeThresholdMinutes: 0,
  createdAt: new Date(),
};

export async function getAttendanceSettings(companyId: string) {
  const doc = await db.collection("attendance_settings").doc(companyId).get();
  if (!doc.exists) {
    return { ...DEFAULT_ATTENDANCE_SETTINGS, companyId };
  }
  const data = doc.data()!;
  return {
    companyId,
    shiftStart: data.shiftStart ?? DEFAULT_ATTENDANCE_SETTINGS.shiftStart,
    shiftEnd: data.shiftEnd ?? DEFAULT_ATTENDANCE_SETTINGS.shiftEnd,
    weekendDays: data.weekendDays ?? DEFAULT_ATTENDANCE_SETTINGS.weekendDays,
    graceMinutes: data.graceMinutes ?? DEFAULT_ATTENDANCE_SETTINGS.graceMinutes,
    roundingMinutes: data.roundingMinutes ?? DEFAULT_ATTENDANCE_SETTINGS.roundingMinutes,
    overtimeThresholdMinutes:
      data.overtimeThresholdMinutes ?? DEFAULT_ATTENDANCE_SETTINGS.overtimeThresholdMinutes,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as AttendanceSettings;
}

export async function updateAttendanceSettings(
  companyId: string,
  updates: Partial<Omit<AttendanceSettings, "companyId" | "createdAt" | "updatedAt">>
) {
  await db.collection("attendance_settings").doc(companyId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
