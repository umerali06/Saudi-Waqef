import { describe, expect, it } from "vitest";
import {
  calculateLeaveDays,
  computeLeaveBalance,
  hasLeaveBalance,
  leaveRangesOverlap,
} from "@/lib/utils/leave";
import { riyadhDate } from "@/lib/utils/riyadh";

const leaveType = { id: "annual", defaultAllowance: 21, isPaid: true };
const request = (startDate: string, endDate: string, status = "approved") => ({
  employeeId: "e1",
  leaveTypeId: "annual",
  startDate,
  endDate,
  days: calculateLeaveDays(startDate, endDate),
  status,
});

describe("leave", () => {
  it("does not charge public holidays", () => {
    expect(
      calculateLeaveDays("2026-03-18", "2026-03-24", [
        { date: "2026-03-20" },
        { date: "2026-03-21" },
        { date: "2026-04-01" },
      ])
    ).toBe(5);
  });

  it("splits a request over new year between both years", () => {
    const requests = [request("2026-12-30", "2027-01-03")];
    const of = (year: number) =>
      computeLeaveBalance({ employeeId: "e1", leaveType, year, requests, adjustments: [] });
    expect(of(2026).used).toBe(2);
    expect(of(2027).used).toBe(3);
  });

  it("applies an adjustment to its own year only", () => {
    const adjustments = [
      {
        employeeId: "e1",
        leaveTypeId: "annual",
        amount: 5,
        createdAt: new Date("2025-12-31T22:00:00Z"), // already 2026 in Riyadh
      },
    ];
    const of = (year: number) =>
      computeLeaveBalance({ employeeId: "e1", leaveType, year, requests: [], adjustments });
    expect(of(2025).balance).toBe(21);
    expect(of(2026).balance).toBe(26);
    expect(of(2027).balance).toBe(21);
  });

  it("checks next year's request against next year's balance", () => {
    const requests = [request("2026-06-01", "2026-06-21")];
    const base = { leaveType, requests, adjustments: [] };
    expect(hasLeaveBalance({ ...base, request: request("2027-01-10", "2027-01-14") })).toBe(true);
    expect(hasLeaveBalance({ ...base, request: request("2026-12-01", "2026-12-02") })).toBe(false);
  });

  it("detects overlapping requests", () => {
    expect(
      leaveRangesOverlap(request("2026-01-01", "2026-01-05"), request("2026-01-05", "2026-01-09"))
    ).toBe(true);
    expect(
      leaveRangesOverlap(request("2026-01-01", "2026-01-05"), request("2026-01-06", "2026-01-09"))
    ).toBe(false);
  });

  it("uses the Riyadh calendar day", () => {
    expect(riyadhDate(new Date("2026-01-01T21:30:00Z"))).toBe("2026-01-02");
  });
});
