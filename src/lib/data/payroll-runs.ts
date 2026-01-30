import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type PayrollRunStatus = "draft" | "approved" | "paid";

export type PayrollRunTotals = {
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  employeeCount: number;
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

export async function updatePayrollRun(
  runId: string,
  updates: Partial<{
    status: PayrollRunStatus;
    totals: PayrollRunTotals;
    approvedBy: string | null;
    approvedAt: Date | null;
    paidAt: Date | null;
    paymentMethod: string | null;
    paymentAccountId: string | null;
    journalEntryId: string | null;
    paymentJournalEntryId: string | null;
  }>
) {
  await db.collection("payroll_runs").doc(runId).set(
    {
      ...updates,
      approvedAt: updates.approvedAt ? Timestamp.fromDate(updates.approvedAt) : undefined,
      paidAt: updates.paidAt ? Timestamp.fromDate(updates.paidAt) : undefined,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
