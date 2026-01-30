import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AttendanceHoliday = {
  id: string;
  companyId: string;
  name: string;
  date: string;
  isPaid: boolean;
  createdAt: Date;
};

export async function listAttendanceHolidays(companyId: string) {
  const snapshot = await db
    .collection("attendance_holidays")
    .where("companyId", "==", companyId)
    .get();

  const holidays = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name ?? "",
      date: data.date,
      isPaid: Boolean(data.isPaid),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as AttendanceHoliday;
  });

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

export async function createAttendanceHoliday(params: {
  companyId: string;
  name: string;
  date: string;
  isPaid?: boolean;
}) {
  const id = uuidv4();
  await db.collection("attendance_holidays").doc(id).set({
    companyId: params.companyId,
    name: params.name.trim(),
    date: params.date,
    isPaid: Boolean(params.isPaid),
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateAttendanceHoliday(
  holidayId: string,
  updates: Partial<Pick<AttendanceHoliday, "name" | "date" | "isPaid">>
) {
  await db
    .collection("attendance_holidays")
    .doc(holidayId)
    .set(
      {
        ...updates,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
}

export async function deleteAttendanceHoliday(holidayId: string) {
  await db.collection("attendance_holidays").doc(holidayId).delete();
}
