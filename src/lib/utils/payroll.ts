import { parseTimeToMinutes } from "@/lib/utils/attendance";
import type { AttendanceRecord } from "@/lib/data/attendance-records";
import type { LeaveRequest } from "@/lib/data/leave-requests";
import type { LeaveType } from "@/lib/data/leave-types";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import type { AttendanceSettings } from "@/lib/data/attendance-settings";
import type { PayrollSettings } from "@/lib/data/payroll-settings";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
}): PayrollComputationResult => {
  const daysInMonth = getDaysInMonth(params.periodStart);
  const activeDays = getOverlapDays(
    params.contract.startDate ?? params.periodStart,
    params.contract.endDate ?? params.periodEnd,
    params.periodStart,
    params.periodEnd
  );
  const prorationFactor = daysInMonth > 0 ? activeDays / daysInMonth : 1;

  const baseSalary = params.contract.salary.basic * prorationFactor;
  const allowances =
    (params.contract.salary.housingAllowance +
      params.contract.salary.transportAllowance +
      params.contract.salary.otherAllowance) *
    prorationFactor;
  const fixedDeductions = params.contract.salary.deductions * prorationFactor;

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
  const absentDays = params.attendanceRecords.filter(
    (record) => record.status === "absent"
  ).length;
  const leaveDays = params.attendanceRecords.filter(
    (record) => record.status === "leave"
  ).length;

  const unpaidLeaveDays = params.leaveRequests.reduce((sum, request) => {
    if (request.status !== "approved") {
      return sum;
    }
    const type = params.leaveTypes.find((entry) => entry.id === request.leaveTypeId);
    if (!type || type.isPaid) {
      return sum;
    }
    const overlap = getOverlapDays(
      request.startDate,
      request.endDate,
      params.periodStart,
      params.periodEnd
    );
    return sum + overlap;
  }, 0);

  const shiftStart = parseTimeToMinutes(params.attendanceSettings.shiftStart) ?? 0;
  const shiftEnd = parseTimeToMinutes(params.attendanceSettings.shiftEnd) ?? 0;
  const shiftMinutes = shiftEnd > shiftStart ? shiftEnd - shiftStart : 0;
  const shiftHours = shiftMinutes > 0 ? shiftMinutes / 60 : 0;
  const hourlyRate =
    shiftHours > 0 && activeDays > 0 ? baseSalary / (activeDays * shiftHours) : 0;

  const overtimePay =
    (overtimeMinutes / 60) *
    hourlyRate *
    (params.payrollSettings.overtimeMultiplier ?? 1);
  const latenessDeduction =
    lateMinutes * (params.payrollSettings.latenessPenaltyPerMinute ?? 0);
  const dailyRate = activeDays > 0 ? (baseSalary + allowances) / activeDays : 0;
  const unpaidLeaveDeduction = unpaidLeaveDays * dailyRate;
  const absenceDeduction = absentDays * dailyRate;

  const statutoryBase = baseSalary + allowances;
  const gosiRate = params.payrollSettings.gosiEnabled
    ? (params.payrollSettings.gosiEmployeeRate ?? 0) / 100
    : 0;
  const incomeTaxRate = params.payrollSettings.incomeTaxEnabled
    ? (params.payrollSettings.incomeTaxRate ?? 0) / 100
    : 0;
  const gosiDeduction = statutoryBase * gosiRate;
  const incomeTaxDeduction = statutoryBase * incomeTaxRate;
  const statutoryDeduction = gosiDeduction + incomeTaxDeduction;

  const grossPay = baseSalary + allowances + overtimePay;
  const totalDeductions =
    fixedDeductions +
    latenessDeduction +
    unpaidLeaveDeduction +
    absenceDeduction +
    statutoryDeduction;
  const netPay = grossPay - totalDeductions;

  return {
    baseSalary,
    allowances,
    fixedDeductions,
    overtimePay,
    latenessDeduction,
    unpaidLeaveDeduction,
    absenceDeduction,
    gosiDeduction,
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
  };
};
