import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import type { PeriodFrequency } from "@/lib/utils/periods";
import { isDateWithinRange } from "@/lib/utils/periods";

export type AccountingPeriod = {
  id: string;
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  frequency: PeriodFrequency;
  status: "open" | "closed";
  lockedAt?: Date;
  lockedBy?: string | null;
  createdAt: Date;
};

export async function listAccountingPeriods(companyId: string) {
  const snapshot = await db
    .collection("accounting_periods")
    .where("companyId", "==", companyId)
    .get();

  const periods = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      frequency: data.frequency,
      status: data.status ?? "open",
      lockedAt: data.lockedAt ? data.lockedAt.toDate() : undefined,
      lockedBy: data.lockedBy ?? null,
      createdAt: data.createdAt.toDate(),
    } as AccountingPeriod;
  });

  return periods.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function createAccountingPeriod(params: {
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  frequency: PeriodFrequency;
}) {
  const id = uuidv4();
  await db.collection("accounting_periods").doc(id).set({
    companyId: params.companyId,
    name: params.name,
    startDate: params.startDate,
    endDate: params.endDate,
    frequency: params.frequency,
    status: "open",
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateAccountingPeriod(
  periodId: string,
  updates: Partial<Pick<AccountingPeriod, "status" | "lockedBy">>
) {
  const updatePayload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.status === "closed") {
    updatePayload.lockedAt = Timestamp.now();
  }
  if (updates.status === "open") {
    updatePayload.lockedAt = null;
    updatePayload.lockedBy = null;
  }
  await db.collection("accounting_periods").doc(periodId).set(updatePayload, {
    merge: true,
  });
}

export async function findClosedPeriod(companyId: string, date: string) {
  const periods = await listAccountingPeriods(companyId);
  return (
    periods.find(
      (period) =>
        period.status === "closed" &&
        isDateWithinRange(date, period.startDate, period.endDate)
    ) ?? null
  );
}
