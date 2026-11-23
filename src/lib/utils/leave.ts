import { riyadhYear } from "@/lib/utils/riyadh";

const DAY_MS = 1000 * 60 * 60 * 24;

type DateRange = { startDate: string; endDate: string };

type LeaveRequestLike = DateRange & {
  employeeId: string;
  leaveTypeId: string;
  days: number;
  status: string;
};

type LeaveAdjustmentLike = {
  employeeId: string;
  leaveTypeId: string;
  amount: number;
  year?: number | null;
  createdAt: Date;
};

/** Calendar days in the range; public holidays falling inside it are not charged as leave. */
export const calculateLeaveDays = (
  startDate: string,
  endDate: string,
  holidays: Array<{ date: string }> = []
) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const diff = end.getTime() - start.getTime();
  if (diff < 0) {
    return 0;
  }
  const days = Math.floor(diff / DAY_MS) + 1;
  const holidayDates = new Set(
    holidays
      .map((holiday) => holiday.date)
      .filter((date) => date >= startDate && date <= endDate)
  );
  return Math.max(days - holidayDates.size, 0);
};

export const leaveRangesOverlap = (a: DateRange, b: DateRange) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;

/** Part of a request charged to one year; requests over new year are split. */
export const leaveDaysInYear = (
  request: DateRange & { days: number },
  year: number,
  holidays: Array<{ date: string }> = []
) => {
  const startsIn = request.startDate.startsWith(`${year}-`);
  const endsIn = request.endDate.startsWith(`${year}-`);
  if (startsIn && endsIn) {
    return request.days;
  }
  const rangeStart = request.startDate > `${year}-01-01` ? request.startDate : `${year}-01-01`;
  const rangeEnd = request.endDate < `${year}-12-31` ? request.endDate : `${year}-12-31`;
  return rangeStart <= rangeEnd ? calculateLeaveDays(rangeStart, rangeEnd, holidays) : 0;
};

export const leaveYears = (range: DateRange) => {
  const first = Number(range.startDate.slice(0, 4));
  const last = Number(range.endDate.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
};

export const computeLeaveBalance = (params: {
  employeeId: string;
  leaveType: { id: string; defaultAllowance: number };
  year: number;
  requests: LeaveRequestLike[];
  adjustments: LeaveAdjustmentLike[];
  holidays?: Array<{ date: string }>;
}) => {
  const matches = (entry: { employeeId: string; leaveTypeId: string }) =>
    entry.employeeId === params.employeeId && entry.leaveTypeId === params.leaveType.id;

  const used = params.requests
    .filter((request) => matches(request) && request.status === "approved")
    .reduce(
      (sum, request) => sum + leaveDaysInYear(request, params.year, params.holidays),
      0
    );
  const adjustments = params.adjustments
    .filter(
      (entry) =>
        matches(entry) && (entry.year ?? riyadhYear(entry.createdAt)) === params.year
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const allowance = params.leaveType.defaultAllowance ?? 0;

  return { allowance, adjustments, used, balance: allowance + adjustments - used };
};

/** Whether a paid-leave request fits the balance of every year it touches. */
export const hasLeaveBalance = (params: {
  request: DateRange & { employeeId: string; days: number };
  leaveType: { id: string; defaultAllowance: number; isPaid: boolean };
  requests: LeaveRequestLike[];
  adjustments: LeaveAdjustmentLike[];
  holidays?: Array<{ date: string }>;
}) =>
  !params.leaveType.isPaid ||
  leaveYears(params.request).every((year) => {
    const { balance } = computeLeaveBalance({
      employeeId: params.request.employeeId,
      leaveType: params.leaveType,
      year,
      requests: params.requests,
      adjustments: params.adjustments,
      holidays: params.holidays,
    });
    return balance >= leaveDaysInYear(params.request, year, params.holidays);
  });
