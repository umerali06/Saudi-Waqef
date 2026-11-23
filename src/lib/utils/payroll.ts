import { parseTimeToMinutes } from "@/lib/utils/attendance";
import { computeGosiContribution } from "@/lib/utils/gosi";
import { roundMoney } from "@/lib/utils/invoice";
import type { AttendanceRecord } from "@/lib/data/attendance-records";
import type { LeaveRequest } from "@/lib/data/leave-requests";
import type { LeaveType } from "@/lib/data/leave-types";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import type { AttendanceSettings } from "@/lib/data/attendance-settings";
import type { PayrollSettings } from "@/lib/data/payroll-settings";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MINUTES_PER_DAY = 24 * 60;
// Saudi payroll practice divides the monthly wage by 30 days.
const DAYS_PER_WAGE_MONTH = 30;

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

export const daysBetweenInclusive = (startDate: string, endDate: string) => {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const diff = end.getTime() - start.getTime();
  if (diff < 0) {
    return 0;
  }
  return Math.floor(diff / MS_PER_DAY) + 1;
};

export const getDaysInMonth = (date: string) => {
  const base = toDate(date);
  if (Number.isNaN(base.getTime())) {
    return 30;
  }
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
};

export const getOverlapDays = (
  startDate: string,
  endDate: string,
  rangeStart: string,
  rangeEnd: string
) => {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const rangeStartDate = toDate(rangeStart);
  const rangeEndDate = toDate(rangeEnd);
  if (
    [start, end, rangeStartDate, rangeEndDate].some((value) =>
      Number.isNaN(value.getTime())
    )
  ) {
    return 0;
  }
  const overlapStart = start > rangeStartDate ? start : rangeStartDate;
  const overlapEnd = end < rangeEndDate ? end : rangeEndDate;
  if (overlapEnd < overlapStart) {
    return 0;
  }
  const diff = overlapEnd.getTime() - overlapStart.getTime();
  return Math.floor(diff / MS_PER_DAY) + 1;
};

export type PayrollComputationResult = {
  baseSalary: number;
  allowances: number;
  fixedDeductions: number;
  overtimePay: number;
  latenessDeduction: number;
  unpaidLeaveDeduction: number;
  absenceDeduction: number;
  gosiDeduction: number;
  gosiEmployerContribution: number;
  incomeTaxDeduction: number;
  statutoryDeduction: number;
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
  currency: string;
  dailyRate: number;
};

export const computePayrollForEmployee = (params: {
  contract: EmployeeContractRecord;
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  leaveTypes: LeaveType[];
  attendanceSettings: AttendanceSettings;
  payrollSettings: PayrollSettings;
  periodStart: string;
  periodEnd: string;
  isSaudi?: boolean;
}): PayrollComputationResult => {
  const daysInMonth = getDaysInMonth(params.periodStart);
  const activeDays = getOverlapDays(
    params.contract.startDate ?? params.periodStart,
    params.contract.endDate ?? params.periodEnd,
    params.periodStart,
    params.periodEnd
  );
  const prorationFactor = daysInMonth > 0 ? activeDays / daysInMonth : 1;

  const baseSalary = roundMoney(params.contract.salary.basic * prorationFactor);
  const monthlyAllowances =
    params.contract.salary.housingAllowance +
    params.contract.salary.transportAllowance +
    params.contract.salary.otherAllowance;
  const allowances = roundMoney(monthlyAllowances * prorationFactor);

  const approvedLeaves = params.leaveRequests.filter(
    (request) => request.status === "approved"
  );
  const isOnApprovedLeave = (date: string) =>
    approvedLeaves.some((request) => date >= request.startDate && date <= request.endDate);

  const totalMinutes = params.attendanceRecords.reduce(
    (sum, record) => sum + (record.totalMinutes ?? 0),
    0
  );
  const overtimeMinutes = params.attendanceRecords.reduce(
    (sum, record) => sum + (record.overtimeMinutes ?? 0),
    0
  );
  const lateMinutes = params.attendanceRecords.reduce(
    (sum, record) => sum + (record.lateMinutes ?? 0),
    0
  );
  // A day covered by approved leave is never also charged as an absence.
  const absentDays = params.attendanceRecords.filter(
    (record) => record.status === "absent" && !isOnApprovedLeave(record.date)
  ).length;
  const leaveDays = params.attendanceRecords.filter(
    (record) => record.status === "leave"
  ).length;

  const rangeStart =
    params.contract.startDate && params.contract.startDate > params.periodStart
      ? params.contract.startDate
      : params.periodStart;
  const rangeEnd =
    params.contract.endDate && params.contract.endDate < params.periodEnd
      ? params.contract.endDate
      : params.periodEnd;
  const unpaidLeaveDays = approvedLeaves.reduce((sum, request) => {
    const type = params.leaveTypes.find((entry) => entry.id === request.leaveTypeId);
    if (!type || type.isPaid) {
      return sum;
    }
    return sum + getOverlapDays(request.startDate, request.endDate, rangeStart, rangeEnd);
  }, 0);

  const shiftStart = parseTimeToMinutes(params.attendanceSettings.shiftStart) ?? 0;
  const shiftEnd = parseTimeToMinutes(params.attendanceSettings.shiftEnd) ?? 0;
  const shiftMinutes =
    shiftEnd > shiftStart ? shiftEnd - shiftStart : shiftEnd - shiftStart + MINUTES_PER_DAY;
  const monthlyHours = (DAYS_PER_WAGE_MONTH * shiftMinutes) / 60;
  const monthlyWage = params.contract.salary.basic + monthlyAllowances;

  // Labor Law Art. 107: the full hourly wage plus 50% of the basic hourly wage. The
  // multiplier setting expresses the premium, so 1.5 means 50% of basic.
  const hourlyWage = monthlyWage / monthlyHours;
  const hourlyBasic = params.contract.salary.basic / monthlyHours;
  const overtimePremium = Math.max((params.payrollSettings.overtimeMultiplier ?? 1) - 1, 0);
  const overtimePay = roundMoney(
    (overtimeMinutes / 60) * (hourlyWage + hourlyBasic * overtimePremium)
  );

  const actualWage = roundMoney(baseSalary + allowances);
  // The daily rate comes from the full monthly wage; a prorated wage is already reduced.
  const dailyRate =
    params.payrollSettings.absenceDailyRateMode === "active_days"
      ? daysInMonth > 0
        ? monthlyWage / daysInMonth
        : 0
      : monthlyWage / DAYS_PER_WAGE_MONTH;

  const gosi = computeGosiContribution({
    basic: params.contract.salary.basic,
    housingAllowance: params.contract.salary.housingAllowance,
    isSaudi: params.isSaudi ?? true,
    prorationFactor,
    settings: params.payrollSettings,
  });
  const incomeTaxRate = params.payrollSettings.incomeTaxEnabled
    ? (params.payrollSettings.incomeTaxRate ?? 0) / 100
    : 0;

  const grossPay = roundMoney(actualWage + overtimePay);

  // Deductions can never exceed the pay they are taken from, so that gross always equals
  // net plus deductions. Unearned wages come off first, then statutory amounts.
  let remaining = grossPay;
  const takeDeduction = (amount: number, limit = remaining) => {
    const taken = roundMoney(Math.max(Math.min(amount, limit, remaining), 0));
    remaining = roundMoney(remaining - taken);
    return taken;
  };
  const unpaidLeaveDeduction = takeDeduction(unpaidLeaveDays * dailyRate, actualWage);
  const absenceDeduction = takeDeduction(
    absentDays * dailyRate,
    actualWage - unpaidLeaveDeduction
  );
  const gosiDeduction = takeDeduction(gosi.employeeShare);
  const incomeTaxDeduction = takeDeduction(actualWage * incomeTaxRate);
  const latenessDeduction = takeDeduction(
    lateMinutes * (params.payrollSettings.latenessPenaltyPerMinute ?? 0)
  );
  const fixedDeductions = takeDeduction(params.contract.salary.deductions * prorationFactor);
  const statutoryDeduction = roundMoney(gosiDeduction + incomeTaxDeduction);
  const netPay = remaining;
  const totalDeductions = roundMoney(grossPay - netPay);
  const gosiEmployerContribution = roundMoney(gosi.employerShare);

  return {
    baseSalary,
    allowances,
    fixedDeductions,
    overtimePay,
    latenessDeduction,
    unpaidLeaveDeduction,
    absenceDeduction,
    gosiDeduction,
    gosiEmployerContribution,
    incomeTaxDeduction,
    statutoryDeduction,
    grossPay,
    totalDeductions,
    netPay,
    overtimeMinutes,
    lateMinutes,
    absentDays,
    unpaidLeaveDays,
    leaveDays,
    totalMinutes,
    prorationFactor,
    activeDays,
    currency: params.contract.salary.currency ?? "SAR",
    dailyRate,
  };
};
