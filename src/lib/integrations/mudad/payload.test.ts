import { describe, expect, it } from "vitest";
import { buildMudadPayload } from "@/lib/integrations/mudad/payload";

describe("buildMudadPayload", () => {
  it("builds payroll protection payload from base integration data", () => {
    const payload = buildMudadPayload({
      companyId: "co-1",
      environment: "sandbox",
      triggeredAt: "2026-05-01T10:00:00.000Z",
      employees: {
        records: [
          {
            id: "emp-1",
            employeeNumber: "E001",
            nameAr: "احمد",
            nameEn: "Ahmed",
            status: "active",
          },
        ],
      },
      attendance: {
        windowStart: "2026-04-01",
        totalRecords: 22,
        absences: 1,
        lateRecords: 2,
        overtimeMinutes: 50,
      },
      payroll: {
        run: { id: "run-1", periodStart: "2026-04-01", periodEnd: "2026-04-30" },
        items: [
          {
            employeeId: "emp-1",
            netPay: 9500,
            grossPay: 12000,
            totalDeductions: 2500,
            unpaidLeaveDeduction: 300,
            absenceDeduction: 200,
          },
        ],
      },
    });

    expect(payload.connector).toBe("mudad");
    expect(payload.workerCount).toBe(1);
    expect(payload.attendanceSummary).toMatchObject({
      absences: 1,
      lateRecords: 2,
    });
    expect(payload.workers[0]).toMatchObject({
      employeeId: "emp-1",
      netPay: 9500,
      grossPay: 12000,
    });
  });
});

