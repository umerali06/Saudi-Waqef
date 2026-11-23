import { describe, expect, it } from "vitest";
import { computeAttendanceMetrics, isOvernightShift, isRestDay } from "@/lib/utils/attendance";

const day = { shiftStart: "09:00", shiftEnd: "17:00" };
const night = { shiftStart: "22:00", shiftEnd: "06:00" };

describe("computeAttendanceMetrics", () => {
  it("does not mark a day with only a check-in as absent", () => {
    const result = computeAttendanceMetrics({ ...day, checkIn: "09:30", graceMinutes: 10 });
    expect(result.status).toBe("late");
    expect(result.lateMinutes).toBe(20);
    expect(computeAttendanceMetrics(day).status).toBe("absent");
  });

  it("handles a night shift that ends after midnight", () => {
    const result = computeAttendanceMetrics({ ...night, checkIn: "22:00", checkOut: "07:00" });
    expect(result.totalMinutes).toBe(540);
    expect(result.overtimeMinutes).toBe(60);
    expect(result.lateMinutes).toBe(0);
    expect(computeAttendanceMetrics({ ...night, checkIn: "00:30", checkOut: "06:00" }).lateMinutes).toBe(150);
    expect(isOvernightShift(night)).toBe(true);
    expect(isOvernightShift(day)).toBe(false);
  });

  it("counts every hour on a rest day as overtime without lateness", () => {
    const result = computeAttendanceMetrics({
      ...day,
      checkIn: "11:00",
      checkOut: "15:00",
      isRestDay: true,
    });
    expect(result.overtimeMinutes).toBe(240);
    expect(result.lateMinutes).toBe(0);
    expect(result.earlyMinutes).toBe(0);
  });
});

describe("isRestDay", () => {
  it("covers weekends and holidays", () => {
    expect(isRestDay("2026-01-02", [5, 6], [])).toBe(true); // Friday
    expect(isRestDay("2026-01-04", [5, 6], [])).toBe(false);
    expect(isRestDay("2026-01-04", [5, 6], [{ date: "2026-01-04" }])).toBe(true);
  });
});
