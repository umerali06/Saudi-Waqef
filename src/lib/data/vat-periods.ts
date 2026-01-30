import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import type { PeriodFrequency } from "@/lib/utils/periods";
import { isDateWithinRange } from "@/lib/utils/periods";

export type VatPeriodStatus = "open" | "filed";

export type VatPeriod = {
  id: string;
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  frequency: PeriodFrequency;
  status: VatPeriodStatus;
  filedAt?: Date;
  filedBy?: string | null;
  filedSummary?: Record<string, unknown> | null;
  createdAt: Date;
};

export async function listVatPeriods(companyId: string) {
  const snapshot = await db
    .collection("vat_periods")
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
      filedAt: data.filedAt ? data.filedAt.toDate() : undefined,
      filedBy: data.filedBy ?? null,
      filedSummary: data.filedSummary ?? null,
      createdAt: data.createdAt.toDate(),
    } as VatPeriod;
  });

  return periods.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function getVatPeriodById(periodId: string) {
  const doc = await db.collection("vat_periods").doc(periodId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    frequency: data.frequency,
    status: data.status ?? "open",
    filedAt: data.filedAt ? data.filedAt.toDate() : undefined,
    filedBy: data.filedBy ?? null,
    filedSummary: data.filedSummary ?? null,
    createdAt: data.createdAt.toDate(),
  } as VatPeriod;
}

export async function createVatPeriod(params: {
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  frequency: PeriodFrequency;
}) {
  const id = uuidv4();
  await db.collection("vat_periods").doc(id).set({
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

export async function updateVatPeriod(
  periodId: string,
  updates: Partial<
    Pick<VatPeriod, "status" | "filedBy" | "filedSummary"> & {
      filedAt?: Date | null;
    }
  >
) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.filedAt === null) {
    payload.filedAt = null;
  } else if (updates.filedAt instanceof Date) {
    payload.filedAt = Timestamp.fromDate(updates.filedAt);
  }
  await db.collection("vat_periods").doc(periodId).set(payload, { merge: true });
}

export async function findFiledVatPeriod(companyId: string, date: string) {
  const periods = await listVatPeriods(companyId);
  return (
    periods.find(
      (period) =>
        period.status === "filed" &&
        isDateWithinRange(date, period.startDate, period.endDate)
    ) ?? null
  );
}
