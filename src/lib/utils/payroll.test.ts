import { describe, expect, it } from "vitest";
import { computePayrollForEmployee, daysBetweenInclusive, getOverlapDays } from "@/lib/utils/payroll";
import type { AttendanceRecord } from "@/lib/data/attendance-records";
import type { LeaveRequest } from "@/lib/data/leave-requests";
import type { LeaveType } from "@/lib/data/leave-types";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import type { AttendanceSettings } from "@/lib/data/attendance-settings";
import type { PayrollSettings } from "@/lib/data/payroll-settings";

describe("date helpers", () => {
  it("calculates inclusive days", () => {
    expect(daysBetweenInclusive("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysBetweenInclusive("2026-01-01", "2026-01-31")).toBe(31);
    expect(daysBetweenInclusive("2026-02-10", "2026-02-01")).toBe(0);
  });

  it("calculates overlap days", () => {
    expect(getOverlapDays("2026-01-01", "2026-01-10", "2026-01-05", "2026-01-20")).toBe(6);
    expect(getOverlapDays("2026-01-01", "2026-01-10", "2026-02-01", "2026-02-05")).toBe(0);
  });
});

describe("computePayrollForEmployee", () => {
  it("computes payroll components", () => {
    const contract: EmployeeContractRecord = {
      id: "c1",
      companyId: "co1",
      employeeId: "e1",
      type: "full_time",
      status: "active",
      startDate: "2026-01-01",
      endDate: null,
      salary: {
        basic: 3000,
        housingAllowance: 500,
        transportAllowance: 200,
        otherAllowance: 0,
        deductions: 100,
        currency: "SAR",
      },
      createdAt: new Date(),
    };

    const attendanceRecords: AttendanceRecord[] = [
      {
        id: "a1",
        companyId: "co1",
        employeeId: "e1",
        date: "2026-01-05",
        status: "present",
        totalMinutes: 480,
        overtimeMinutes: 120,
        lateMinutes: 10,
        earlyMinutes: 0,
        source: "manual",
        createdAt: new Date(),
      },
      {
        id: "a2",
        companyId: "co1",
        employeeId: "e1",
        date: "2026-01-06",
        status: "absent",
        totalMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        source: "manual",
        createdAt: new Date(),
      },
    ];

    const leaveTypes: LeaveType[] = [
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
    ];

    const leaveRequests: LeaveRequest[] = [
      {
        id: "lr1",
        companyId: "co1",
        employeeId: "e1",
        leaveTypeId: "lt1",
        startDate: "2026-01-10",
        endDate: "2026-01-11",
        days: 2,
        status: "approved",
        createdAt: new Date(),
      },
    ];

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

    const payrollSettings: PayrollSettings = {
      companyId: "co1",
      cycle: "monthly",
      overtimeMultiplier: 1.5,
      latenessPenaltyPerMinute: 2,
      gosiEnabled: true,
      gosiEmployeeRate: 2,
      gosiEmployerRate: 0,
      incomeTaxEnabled: false,
      incomeTaxRate: 0,
      salaryExpenseAccountId: null,
      payrollPayableAccountId: null,
      salaryDeductionsAccountId: null,
      paymentAccountId: null,
      createdAt: new Date(),
    };

    const result = computePayrollForEmployee({
      contract,
      attendanceRecords,
      leaveRequests,
      leaveTypes,
      attendanceSettings,
      payrollSettings,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });

    expect(result.baseSalary).toBeCloseTo(3000, 2);
    expect(result.allowances).toBeCloseTo(700, 2);
    expect(result.fixedDeductions).toBeCloseTo(100, 2);
    expect(result.overtimePay).toBeCloseTo(36.29, 2);
    expect(result.latenessDeduction).toBeCloseTo(20, 2);
    expect(result.unpaidLeaveDeduction).toBeCloseTo(238.71, 2);
    expect(result.absenceDeduction).toBeCloseTo(119.35, 2);
    expect(result.gosiDeduction).toBeCloseTo(74, 2);
    expect(result.grossPay).toBeCloseTo(3736.29, 2);
    expect(result.totalDeductions).toBeCloseTo(552.06, 2);
    expect(result.netPay).toBeCloseTo(3184.23, 2);
    expect(result.absentDays).toBe(1);
    expect(result.unpaidLeaveDays).toBe(2);
  });
});
