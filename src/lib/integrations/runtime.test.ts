import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeIntegrationRequest } from "@/lib/integrations/runtime";

vi.mock("@/lib/data/employees", () => ({
  listEmployees: vi.fn().mockResolvedValue([
    {
      id: "e1",
      employeeNumber: "EMP-1",
      nameAr: "أحمد",
      nameEn: "Ahmed",
      departmentId: "d1",
      positionId: "p1",
      hireDate: "2025-01-01",
      status: "active",
    },
  ]),
}));

vi.mock("@/lib/data/payroll-runs", () => ({
  listPayrollRuns: vi.fn().mockResolvedValue([
    {
      id: "run-1",
      companyId: "co1",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      status: "approved",
      totals: {
        grossPay: 1000,
        totalDeductions: 100,
        netPay: 900,
        employeeCount: 1,
      },
    },
  ]),
}));

vi.mock("@/lib/data/payroll-run-items", () => ({
  listPayrollRunItems: vi.fn().mockResolvedValue([
    {
      employeeId: "e1",
      currency: "SAR",
      grossPay: 1000,
      totalDeductions: 100,
      netPay: 900,
      absenceDeduction: 50,
      unpaidLeaveDeduction: 25,
      gosiDeduction: 90,
    },
  ]),
}));

vi.mock("@/lib/data/attendance-records", () => ({
  listAttendanceRecords: vi.fn().mockResolvedValue([
    {
      date: new Date().toISOString().slice(0, 10),
      status: "late",
      overtimeMinutes: 30,
    },
  ]),
}));

describe("executeIntegrationRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("performs a test request using the configured endpoint and bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeIntegrationRequest({
      integration: {
        id: "i1",
        companyId: "co1",
        name: "Custom",
        connector: "custom",
        status: "inactive",
        environment: "sandbox",
        config: {
          endpoint: "https://api.example.com/health",
        },
        credentials: { apiKey: "secret" },
        createdAt: new Date(),
      },
      mode: "test",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/health",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }),
      })
    );
  });

  it("sends a JSON snapshot payload during sync", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      statusText: "Accepted",
      text: vi.fn().mockResolvedValue("accepted"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await executeIntegrationRequest({
      integration: {
        id: "i1",
        companyId: "co1",
        name: "Custom",
        connector: "custom",
        status: "inactive",
        environment: "sandbox",
        config: {
          endpoint: "https://api.example.com/sync",
          authType: "api_key",
          apiKeyHeader: "x-token",
        },
        credentials: { apiKey: "secret" },
        createdAt: new Date(),
      },
      mode: "sync",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/sync",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-token": "secret",
        }),
        body: expect.stringContaining('"source":"saudi-waqef"'),
      })
    );
  });
});
