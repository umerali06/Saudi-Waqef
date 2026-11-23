import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type PayrollRunStatus = "draft" | "approved" | "paid";

export type PayrollRunTotals = {
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  employeeCount: number;
  gosiEmployer?: number;
};

export type PayrollRun = {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  totals: PayrollRunTotals;
  createdBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  paidAt?: Date | null;
  paymentMethod?: string | null;
  paymentAccountId?: string | null;
  journalEntryId?: string | null;
  paymentJournalEntryId?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listPayrollRuns(companyId: string) {
  const snapshot = await db
    .collection("payroll_runs")
    .where("companyId", "==", companyId)
    .get();

  const runs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: (data.status ?? "draft") as PayrollRunStatus,
      totals: {
        grossPay: data.totals?.grossPay ?? 0,
        totalDeductions: data.totals?.totalDeductions ?? 0,
        netPay: data.totals?.netPay ?? 0,
        employeeCount: data.totals?.employeeCount ?? 0,
        gosiEmployer: data.totals?.gosiEmployer ?? 0,
      },
      createdBy: data.createdBy ?? null,
      approvedBy: data.approvedBy ?? null,
      approvedAt: data.approvedAt?.toDate ? data.approvedAt.toDate() : null,
      paidAt: data.paidAt?.toDate ? data.paidAt.toDate() : null,
      paymentMethod: data.paymentMethod ?? null,
      paymentAccountId: data.paymentAccountId ?? null,
      journalEntryId: data.journalEntryId ?? null,
      paymentJournalEntryId: data.paymentJournalEntryId ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as PayrollRun;
  });

  return runs.sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export async function getPayrollRun(runId: string) {
  const doc = await db.collection("payroll_runs").doc(runId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    status: (data.status ?? "draft") as PayrollRunStatus,
    totals: {
      grossPay: data.totals?.grossPay ?? 0,
      totalDeductions: data.totals?.totalDeductions ?? 0,
      netPay: data.totals?.netPay ?? 0,
      employeeCount: data.totals?.employeeCount ?? 0,
      gosiEmployer: data.totals?.gosiEmployer ?? 0,
    },
    createdBy: data.createdBy ?? null,
    approvedBy: data.approvedBy ?? null,
    approvedAt: data.approvedAt?.toDate ? data.approvedAt.toDate() : null,
    paidAt: data.paidAt?.toDate ? data.paidAt.toDate() : null,
    paymentMethod: data.paymentMethod ?? null,
    paymentAccountId: data.paymentAccountId ?? null,
    journalEntryId: data.journalEntryId ?? null,
    paymentJournalEntryId: data.paymentJournalEntryId ?? null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as PayrollRun;
}

export async function createPayrollRun(params: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  status?: PayrollRunStatus;
  totals: PayrollRunTotals;
  createdBy?: string | null;
}) {
  const id = uuidv4();
  await db.collection("payroll_runs").doc(id).set({
    companyId: params.companyId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    status: params.status ?? "draft",
    totals: params.totals,
    createdBy: params.createdBy ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export type PayrollRunUpdates = Partial<{
  status: PayrollRunStatus;
  totals: PayrollRunTotals;
  approvedBy: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentAccountId: string | null;
  journalEntryId: string | null;
  paymentJournalEntryId: string | null;
}>;

function toRunPayload(updates: PayrollRunUpdates) {
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  if (updates.approvedAt !== undefined) {
    payload.approvedAt = updates.approvedAt ? Timestamp.fromDate(updates.approvedAt) : null;
  }
  if (updates.paidAt !== undefined) {
    payload.paidAt = updates.paidAt ? Timestamp.fromDate(updates.paidAt) : null;
  }
  return payload;
}

export async function updatePayrollRun(runId: string, updates: PayrollRunUpdates) {
  await db.collection("payroll_runs").doc(runId).set(toRunPayload(updates), { merge: true });
}

/**
 * Moves a run to the next status only if it is still in the expected one, so that two
 * concurrent requests can never both post a journal entry for it.
 */
export async function claimPayrollRunStatus(
  runId: string,
  from: PayrollRunStatus,
  updates: PayrollRunUpdates & { status: PayrollRunStatus }
) {
  const ref = db.collection("payroll_runs").doc(runId);
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists || (doc.data()!.status ?? "draft") !== from) {
      return false;
    }
    transaction.set(ref, toRunPayload(updates), { merge: true });
    return true;
  });
}

export async function deletePayrollRun(runId: string) {
  const [items, adjustments] = await Promise.all([
    db.collection("payroll_run_items").where("runId", "==", runId).get(),
    db.collection("payroll_adjustments").where("runId", "==", runId).get(),
  ]);
  const refs = [...items.docs, ...adjustments.docs].map((doc) => doc.ref);
  refs.push(db.collection("payroll_runs").doc(runId));
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}
