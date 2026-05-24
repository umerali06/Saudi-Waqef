import { describe, expect, it } from "vitest";
import { buildGosiPayload } from "@/lib/integrations/gosi/payload";

describe("buildGosiPayload", () => {
  it("builds contribution payload from base integration data", () => {
    const payload = buildGosiPayload({
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
            hireDate: "2025-01-01",
          },
        ],
      },
      payroll: {
        run: { id: "run-1", periodEnd: "2026-04-30" },
        items: [{ employeeId: "emp-1", grossPay: 12000, gosiDeduction: 1080 }],
      },
    });

    expect(payload.connector).toBe("gosi");
    expect(payload.contributionPeriod).toBe("2026-04");
    expect(payload.employeeCount).toBe(1);
    expect(payload.employees[0]).toMatchObject({
      employeeId: "emp-1",
      grossPay: 12000,
      gosiDeduction: 1080,
    });
  });
});

