import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

export type PayrollSettings = {
  companyId: string;
  cycle: "monthly";
  overtimeMultiplier: number;
  latenessPenaltyPerMinute: number;
  absenceDailyRateMode: "labor_law_30" | "active_days";
  eosbEnabled: boolean;
  eosbWageBasis: "actual" | "basic";
  gosiEnabled: boolean;
  gosiEmployeeRate: number;
  gosiEmployerRate: number;
  incomeTaxEnabled: boolean;
  incomeTaxRate: number;
  salaryExpenseAccountId: string | null;
  payrollPayableAccountId: string | null;
  salaryDeductionsAccountId: string | null;
  paymentAccountId: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

const DEFAULT_SETTINGS: PayrollSettings = {
  companyId: "",
  cycle: "monthly",
  overtimeMultiplier: 1.5,
  latenessPenaltyPerMinute: 0,
  absenceDailyRateMode: "labor_law_30",
  eosbEnabled: true,
  eosbWageBasis: "actual",
  gosiEnabled: false,
  gosiEmployeeRate: 0,
  gosiEmployerRate: 0,
  incomeTaxEnabled: false,
  incomeTaxRate: 0,
  salaryExpenseAccountId: null,
  payrollPayableAccountId: null,
  salaryDeductionsAccountId: null,
  paymentAccountId: null,
  createdAt: new Date(),
};

export async function getPayrollSettings(companyId: string) {
  const doc = await db.collection("payroll_settings").doc(companyId).get();
  if (!doc.exists) {
    return { ...DEFAULT_SETTINGS, companyId };
  }
  const data = doc.data()!;
  return {
    companyId,
    cycle: (data.cycle ?? "monthly") as "monthly",
    overtimeMultiplier: data.overtimeMultiplier ?? 1.5,
    latenessPenaltyPerMinute: data.latenessPenaltyPerMinute ?? 0,
    absenceDailyRateMode:
      (data.absenceDailyRateMode ?? "labor_law_30") as "labor_law_30" | "active_days",
    eosbEnabled: data.eosbEnabled ?? true,
    eosbWageBasis: (data.eosbWageBasis ?? "actual") as "actual" | "basic",
    gosiEnabled: data.gosiEnabled ?? false,
    gosiEmployeeRate: data.gosiEmployeeRate ?? 0,
    gosiEmployerRate: data.gosiEmployerRate ?? 0,
    incomeTaxEnabled: data.incomeTaxEnabled ?? false,
    incomeTaxRate: data.incomeTaxRate ?? 0,
    salaryExpenseAccountId: data.salaryExpenseAccountId ?? null,
    payrollPayableAccountId: data.payrollPayableAccountId ?? null,
    salaryDeductionsAccountId: data.salaryDeductionsAccountId ?? null,
    paymentAccountId: data.paymentAccountId ?? null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as PayrollSettings;
}

export async function updatePayrollSettings(
  companyId: string,
  updates: Partial<
    Omit<PayrollSettings, "companyId" | "createdAt" | "updatedAt">
  >
) {
  await db.collection("payroll_settings").doc(companyId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
