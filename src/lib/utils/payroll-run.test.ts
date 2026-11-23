import { describe, expect, it } from "vitest";
import type { AttendanceSettings } from "@/lib/data/attendance-settings";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import type { LeaveRequest } from "@/lib/data/leave-requests";
import type { LeaveType } from "@/lib/data/leave-types";
import type { PayrollSettings } from "@/lib/data/payroll-settings";
import { computeGosiContribution, isSaudiNational } from "@/lib/utils/gosi";
import { computePayrollForEmployee } from "@/lib/utils/payroll";
import {
  buildPayrollJournalLines,
  capContractEnd,
  getPayableUntil,
  isBalancedJournal,
  periodsOverlap,
  pickPayrollContract,
} from "@/lib/utils/payroll-run";

const settings: PayrollSettings = {
  companyId: "co1",
  cycle: "monthly",
  overtimeMultiplier: 1.5,
  latenessPenaltyPerMinute: 0,
  absenceDailyRateMode: "labor_law_30",
  eosbEnabled: true,
  eosbWageBasis: "actual",
  gosiEnabled: true,
  gosiEmployeeRate: 9.75,
  gosiEmployerRate: 11.75,
  gosiNonSaudiEmployerRate: 2,
  gosiMinBase: 1500,
  gosiMaxBase: 45000,
  incomeTaxEnabled: false,
  incomeTaxRate: 0,
  salaryExpenseAccountId: null,
  payrollPayableAccountId: null,
  salaryDeductionsAccountId: null,
  gosiExpenseAccountId: null,
  gosiPayableAccountId: null,
  paymentAccountId: null,
  createdAt: new Date(),
};

const attendanceSettings: AttendanceSettings = {
  companyId: "co1",
  shiftStart: "09:00",
  shiftEnd: "17:00",
  weekendDays: [5, 6],
  graceMinutes: 0,
  roundingMinutes: 0,
  overtimeThresholdMinutes: 0,
  createdAt: new Date(),
};

const contract = (overrides: Partial<EmployeeContractRecord> = {}): EmployeeContractRecord => ({
  id: "c1",
  companyId: "co1",
  employeeId: "e1",
  type: "full_time",
  status: "active",
  startDate: "2025-01-01",
  endDate: null,
  salary: {
    basic: 8000,
    housingAllowance: 2000,
    transportAllowance: 500,
    otherAllowance: 0,
    deductions: 0,
    currency: "SAR",
  },
  createdAt: new Date(),
  ...overrides,
});

describe("GOSI", () => {
  it("charges Saudis on basic plus housing, capped at 45,000", () => {
    const share = computeGosiContribution({
      basic: 8000,
      housingAllowance: 2000,
      isSaudi: true,
      settings,
    });
    expect(share.employeeShare).toBeCloseTo(975, 2);
    expect(share.employerShare).toBeCloseTo(1175, 2);
    const capped = computeGosiContribution({
      basic: 60000,
      housingAllowance: 15000,
      isSaudi: true,
      settings,
    });
    expect(capped.base).toBe(45000);
  });

  it("charges nothing to non-Saudis and 2% occupational hazards to the employer", () => {
    const share = computeGosiContribution({
      basic: 4000,
      housingAllowance: 1000,
      isSaudi: false,
      settings,
    });
    expect(share.employeeShare).toBe(0);
    expect(share.employerShare).toBeCloseTo(100, 2);
  });

  it("reads nationality in both languages and falls back to the ID number", () => {
    expect(isSaudiNational({ nationality: " Saudi " })).toBe(true);
    expect(isSaudiNational({ nationality: "سعودي" })).toBe(true);
    expect(isSaudiNational({ nationality: "Egyptian" })).toBe(false);
    expect(isSaudiNational({ iqamaNumber: "2123456789" })).toBe(false);
    expect(isSaudiNational({ nationalId: "1012345678" })).toBe(true);
  });
});

describe("computePayrollForEmployee", () => {
  const base = {
    contract: contract(),
    attendanceRecords: [],
    leaveRequests: [] as LeaveRequest[],
    leaveTypes: [] as LeaveType[],
    attendanceSettings,
    payrollSettings: settings,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
  };

  it("keeps gross equal to net plus deductions when unpaid leave exceeds the wage", () => {
    const result = computePayrollForEmployee({
      ...base,
      leaveTypes: [
        {
          id: "lt1",
          companyId: "co1",
          name: "Unpaid",
          code: "UNP",
          isPaid: false,
          defaultAllowance: 0,
          requiresApproval: true,
          status: "active",
          createdAt: new Date(),
        },
      ],
      leaveRequests: [
        {
          id: "lr1",
          companyId: "co1",
          employeeId: "e1",
          leaveTypeId: "lt1",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          days: 31,
          status: "approved",
          createdAt: new Date(),
        },
      ],
    });
    expect(result.netPay).toBe(0);
    expect(result.unpaidLeaveDeduction).toBe(10500);
    expect(result.totalDeductions).toBe(result.grossPay);
  });

  it("uses the full monthly wage for the daily rate of a mid-month joiner", () => {
    const result = computePayrollForEmployee({
      ...base,
      contract: contract({ startDate: "2026-01-17" }),
    });
    expect(result.activeDays).toBe(15);
    expect(result.dailyRate).toBeCloseTo(350, 2);
  });
});

describe("payroll run eligibility", () => {
  const period = { periodStart: "2026-01-01", periodEnd: "2026-01-31" };

  it("pays a terminated employee up to the termination date only", () => {
    expect(
      getPayableUntil({ status: "terminated", terminationDate: "2026-01-10" }, period)
    ).toBe("2026-01-10");
    expect(
      getPayableUntil({ status: "terminated", terminationDate: "2025-12-31" }, period)
    ).toBeNull();
    expect(getPayableUntil({ status: "suspended" }, period)).toBeNull();
    expect(capContractEnd(contract(), "2026-01-10").endDate).toBe("2026-01-10");
  });

  it("never pays draft, undated ended, or out-of-period contracts", () => {
    const params = {
      periodStart: period.periodStart,
      payableUntil: period.periodEnd,
      isTerminated: false,
    };
    expect(pickPayrollContract([contract({ status: "draft" })], params)).toBeNull();
    expect(pickPayrollContract([contract({ status: "ended" })], params)).toBeNull();
    expect(pickPayrollContract([contract({ endDate: "2025-12-31" })], params)).toBeNull();
    expect(
      pickPayrollContract([contract({ status: "ended" })], { ...params, isTerminated: true })?.id
    ).toBe("c1");
  });

  it("detects overlapping periods", () => {
    expect(
      periodsOverlap(period, { periodStart: "2026-01-01", periodEnd: "2026-01-30" })
    ).toBe(true);
    expect(
      periodsOverlap(period, { periodStart: "2026-02-01", periodEnd: "2026-02-28" })
    ).toBe(false);
  });
});

describe("buildPayrollJournalLines", () => {
  const accounts = {
    salaryExpenseAccountId: "exp",
    payrollPayableAccountId: "pay",
    salaryDeductionsAccountId: "ded",
    gosiExpenseAccountId: null,
    gosiPayableAccountId: null,
  };

  it("stays balanced with adjustments, which are part of net pay", () => {
    const lines = buildPayrollJournalLines({
      netPay: 9500,
      totalDeductions: 1000,
      gosiEmployer: 1175,
      accounts,
    });
    expect(isBalancedJournal(lines)).toBe(true);
    expect(lines[0]).toEqual({ accountId: "exp", debit: 10500, credit: 0 });
    expect(lines).toHaveLength(3);
  });

  it("adds the employer GOSI share only when its account is configured", () => {
    const lines = buildPayrollJournalLines({
      netPay: 9500,
      totalDeductions: 1000,
      gosiEmployer: 1175,
      accounts: { ...accounts, gosiPayableAccountId: "gosi" },
    });
    expect(isBalancedJournal(lines)).toBe(true);
    expect(lines).toContainEqual({ accountId: "gosi", debit: 0, credit: 1175 });
    expect(lines).toContainEqual({ accountId: "exp", debit: 1175, credit: 0 });
  });
});
