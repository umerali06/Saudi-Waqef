import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type PayrollRunItem = {
  id: string;
  companyId: string;
  runId: string;
  employeeId: string;
  contractId: string;
  currency: string;
  baseSalary: number;
  allowances: number;
  fixedDeductions: number;
  overtimePay: number;
  latenessDeduction: number;
  unpaidLeaveDeduction: number;
  absenceDeduction: number;
  gosiDeduction: number;
  incomeTaxDeduction: number;
  statutoryDeduction: number;
  adjustmentsTotal: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  overtimeMinutes: number;
  lateMinutes: number;
  absentDays: number;
  unpaidLeaveDays: number;
  leaveDays: number;
  totalMinutes: number;
  prorationFactor: number;
  activeDays: number;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listPayrollRunItems(runId: string) {
  const snapshot = await db
    .collection("payroll_run_items")
    .where("runId", "==", runId)
    .get();

  const items = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      runId: data.runId,
      employeeId: data.employeeId,
      contractId: data.contractId,
      currency: data.currency ?? "SAR",
      baseSalary: data.baseSalary ?? 0,
      allowances: data.allowances ?? 0,
      fixedDeductions: data.fixedDeductions ?? 0,
      overtimePay: data.overtimePay ?? 0,
      latenessDeduction: data.latenessDeduction ?? 0,
      unpaidLeaveDeduction: data.unpaidLeaveDeduction ?? 0,
      absenceDeduction: data.absenceDeduction ?? 0,
      gosiDeduction: data.gosiDeduction ?? 0,
      incomeTaxDeduction: data.incomeTaxDeduction ?? 0,
      statutoryDeduction: data.statutoryDeduction ?? 0,
      adjustmentsTotal: data.adjustmentsTotal ?? 0,
      grossPay: data.grossPay ?? 0,
      totalDeductions: data.totalDeductions ?? 0,
      netPay: data.netPay ?? 0,
      overtimeMinutes: data.overtimeMinutes ?? 0,
      lateMinutes: data.lateMinutes ?? 0,
      absentDays: data.absentDays ?? 0,
      unpaidLeaveDays: data.unpaidLeaveDays ?? 0,
      leaveDays: data.leaveDays ?? 0,
      totalMinutes: data.totalMinutes ?? 0,
      prorationFactor: data.prorationFactor ?? 1,
      activeDays: data.activeDays ?? 0,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as PayrollRunItem;
  });

  return items.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

export async function getPayrollRunItem(itemId: string) {
  const doc = await db.collection("payroll_run_items").doc(itemId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    runId: data.runId,
    employeeId: data.employeeId,
    contractId: data.contractId,
    currency: data.currency ?? "SAR",
    baseSalary: data.baseSalary ?? 0,
    allowances: data.allowances ?? 0,
    fixedDeductions: data.fixedDeductions ?? 0,
    overtimePay: data.overtimePay ?? 0,
    latenessDeduction: data.latenessDeduction ?? 0,
    unpaidLeaveDeduction: data.unpaidLeaveDeduction ?? 0,
    absenceDeduction: data.absenceDeduction ?? 0,
    gosiDeduction: data.gosiDeduction ?? 0,
    incomeTaxDeduction: data.incomeTaxDeduction ?? 0,
    statutoryDeduction: data.statutoryDeduction ?? 0,
    adjustmentsTotal: data.adjustmentsTotal ?? 0,
    grossPay: data.grossPay ?? 0,
    totalDeductions: data.totalDeductions ?? 0,
    netPay: data.netPay ?? 0,
    overtimeMinutes: data.overtimeMinutes ?? 0,
    lateMinutes: data.lateMinutes ?? 0,
    absentDays: data.absentDays ?? 0,
    unpaidLeaveDays: data.unpaidLeaveDays ?? 0,
    leaveDays: data.leaveDays ?? 0,
    totalMinutes: data.totalMinutes ?? 0,
    prorationFactor: data.prorationFactor ?? 1,
    activeDays: data.activeDays ?? 0,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as PayrollRunItem;
}

export async function createPayrollRunItem(params: Omit<PayrollRunItem, "id" | "createdAt" | "updatedAt">) {
  const id = uuidv4();
  await db.collection("payroll_run_items").doc(id).set({
    ...params,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updatePayrollRunItem(
  itemId: string,
  updates: Partial<
    Pick<
      PayrollRunItem,
      | "adjustmentsTotal"
      | "grossPay"
      | "totalDeductions"
      | "netPay"
      | "baseSalary"
      | "allowances"
      | "fixedDeductions"
      | "overtimePay"
      | "latenessDeduction"
      | "unpaidLeaveDeduction"
      | "absenceDeduction"
    >
  >
) {
  await db.collection("payroll_run_items").doc(itemId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
