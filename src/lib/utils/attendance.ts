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

export const computeAttendanceMetrics = (params: {
  checkIn?: string | null;
  checkOut?: string | null;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes?: number;
  overtimeThresholdMinutes?: number;
  roundingMinutes?: number;
}): AttendanceMetrics => {
  const checkIn = parseTimeToMinutes(params.checkIn);
  const checkOut = parseTimeToMinutes(params.checkOut);
  const shiftStart = parseTimeToMinutes(params.shiftStart) ?? 0;
  const shiftEnd = parseTimeToMinutes(params.shiftEnd) ?? 0;
  const grace = params.graceMinutes ?? 0;
  const overtimeThreshold = params.overtimeThresholdMinutes ?? 0;
  const rounding = params.roundingMinutes ?? 0;

  if (checkIn === null || checkOut === null) {
    return {
      status: "absent",
      totalMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyMinutes: 0,
    };
  }

  const rawTotal = clampMinutes(checkOut - checkIn);
  const lateMinutes =
    checkIn > shiftStart + grace ? clampMinutes(checkIn - (shiftStart + grace)) : 0;
  const earlyMinutes = checkOut < shiftEnd ? clampMinutes(shiftEnd - checkOut) : 0;
  const rawOvertime = checkOut > shiftEnd ? clampMinutes(checkOut - shiftEnd) : 0;
  const overtimeMinutes = rawOvertime >= overtimeThreshold ? rawOvertime : 0;

  const totalMinutes = roundMinutes(rawTotal, rounding);
  const roundedOvertime = roundMinutes(overtimeMinutes, rounding);

  return {
    status: lateMinutes > 0 ? "late" : "present",
    totalMinutes,
    overtimeMinutes: roundedOvertime,
    lateMinutes,
    earlyMinutes,
  };
};
