export const parseTimeToMinutes = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

export const roundMinutes = (value: number, roundingMinutes?: number | null) => {
  if (!roundingMinutes || roundingMinutes <= 0) {
    return value;
  }
  return Math.round(value / roundingMinutes) * roundingMinutes;
};

export const clampMinutes = (value: number) => (value < 0 ? 0 : value);

export type AttendanceMetrics = {
  status: "present" | "late" | "absent";
  totalMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
};

const MINUTES_PER_DAY = 24 * 60;

export const isOvernightShift = (settings: { shiftStart: string; shiftEnd: string }) => {
  const start = parseTimeToMinutes(settings.shiftStart);
  const end = parseTimeToMinutes(settings.shiftEnd);
  return start !== null && end !== null && end <= start;
};

/** Weekly rest days and public holidays, on which every hour worked is overtime. */
export const isRestDay = (
  date: string,
  weekendDays: number[],
  holidays: Array<{ date: string }>
) =>
  weekendDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) ||
  holidays.some((holiday) => holiday.date === date);

export const computeAttendanceMetrics = (params: {
  checkIn?: string | null;
  checkOut?: string | null;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes?: number;
  overtimeThresholdMinutes?: number;
  roundingMinutes?: number;
  isRestDay?: boolean;
}): AttendanceMetrics => {
  let checkIn = parseTimeToMinutes(params.checkIn);
  let checkOut = parseTimeToMinutes(params.checkOut);
  const shiftStart = parseTimeToMinutes(params.shiftStart) ?? 0;
  let shiftEnd = parseTimeToMinutes(params.shiftEnd) ?? 0;
  const grace = params.graceMinutes ?? 0;
  const overtimeThreshold = params.overtimeThresholdMinutes ?? 0;
  const rounding = params.roundingMinutes ?? 0;

  if (checkIn === null && checkOut === null) {
    return {
      status: "absent",
      totalMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyMinutes: 0,
    };
  }

  if (shiftEnd <= shiftStart) {
    // Night shift: times after midnight belong to the day the shift started on.
    if (checkIn !== null && checkIn < shiftEnd) {
      checkIn += MINUTES_PER_DAY;
    }
    shiftEnd += MINUTES_PER_DAY;
    if (checkOut !== null && checkOut < (checkIn ?? shiftStart)) {
      checkOut += MINUTES_PER_DAY;
    }
  }

  const lateMinutes =
    !params.isRestDay && checkIn !== null ? clampMinutes(checkIn - (shiftStart + grace)) : 0;
  const status = lateMinutes > 0 ? "late" : "present";

  if (checkIn === null || checkOut === null) {
    return { status, totalMinutes: 0, overtimeMinutes: 0, lateMinutes, earlyMinutes: 0 };
  }

  const rawTotal = clampMinutes(checkOut - checkIn);
  const earlyMinutes = params.isRestDay ? 0 : clampMinutes(shiftEnd - checkOut);
  const rawOvertime = params.isRestDay ? rawTotal : clampMinutes(checkOut - shiftEnd);
  const overtimeMinutes = rawOvertime >= overtimeThreshold ? rawOvertime : 0;

  return {
    status,
    totalMinutes: roundMinutes(rawTotal, rounding),
    overtimeMinutes: roundMinutes(overtimeMinutes, rounding),
    lateMinutes,
    earlyMinutes,
  };
};
