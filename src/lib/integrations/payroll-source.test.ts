import { describe, expect, it } from "vitest";
import type { EmployeeRecord } from "@/lib/data/employees";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import type { PayrollRun } from "@/lib/data/payroll-runs";
import type { PayrollRunItem } from "@/lib/data/payroll-run-items";
import { buildGosiPayload } from "@/lib/integrations/gosi/payload";
import { buildMudadPayload, buildWageFileCsv } from "@/lib/integrations/mudad/payload";
import {
  buildFilingRows,
  findFilingIssues,
  findFilingRun,
  isValidSaudiIdentity,
} from "@/lib/integrations/payroll-source";
import { isValidSaudiIban, normalizeIban } from "@/lib/utils/iban";

// Made-up identifiers that satisfy the real checksums.
const IBAN = "SA0380000000608010167519";
const SAUDI_ID = "1000000008";
const IQAMA = "2345678904";

const employee = (over: Partial<EmployeeRecord>): EmployeeRecord => ({
  id: "e1", companyId: "c1", nameAr: "أحمد", nameEn: "Ahmed", nationality: "Saudi",
  nationalId: SAUDI_ID, iban: "sa03 8000 0000 6080 1016 7519", hireDate: "2024-01-01",
  status: "active", createdAt: new Date(), ...over,
});
const item = (over: Partial<PayrollRunItem>) =>
  ({
    employeeId: "e1", contractId: "k1", baseSalary: 8000, allowances: 3000, totalDeductions: 1280,
    netPay: 10220, prorationFactor: 1, gosiDeduction: 975, gosiEmployerContribution: 1175, ...over,
  }) as PayrollRunItem;
const contracts = new Map([
  ["k1", { salary: { basic: 8000, housingAllowance: 2000, transportAllowance: 1000, otherAllowance: 0, deductions: 0, currency: "SAR" } } as EmployeeContractRecord],
]);
const run = { id: "r1", periodStart: "2026-04-01", periodEnd: "2026-04-30" };
const rows = buildFilingRows({
  employees: [employee({}), employee({ id: "e2", nameAr: "جون", nameEn: "John", nationality: "Indian", nationalId: null, iqamaNumber: IQAMA })],
  items: [item({}), item({ employeeId: "e2", gosiDeduction: 0, gosiEmployerContribution: 200 })],
  contracts,
});

describe("payroll filings", () => {
  it("validates Saudi identity numbers and IBANs by checksum", () => {
    expect(isValidSaudiIdentity(SAUDI_ID)).toBe(true);
    expect(isValidSaudiIdentity("1000000007")).toBe(false);
    expect(isValidSaudiIdentity("3000000008")).toBe(false);
    expect(isValidSaudiIban(IBAN)).toBe(true);
    expect(isValidSaudiIban("SA0480000000608010167519")).toBe(false);
    expect(normalizeIban(" sa03 8000 ")).toBe("SA038000");
  });

  it("splits earnings so they always reconcile to the net wage", () => {
    for (const row of rows) {
      expect(row.basic + row.housing + row.otherEarnings - row.deductions).toBeCloseTo(row.net, 2);
    }
    expect(rows[0]).toMatchObject({ basic: 8000, housing: 2000, otherEarnings: 1500, isSaudi: true, iban: IBAN });
  });

  it("files the GOSI contributory wage and both shares", () => {
    const payload = buildGosiPayload({ establishment: { name: "Co", crNumber: "1", gosiNumber: "9" }, run, rows });
    expect(payload.contributionMonth).toBe("2026-04");
    expect(payload.totals).toEqual({ employee: 975, employer: 1375, payable: 2350 });
    expect(payload.contributors[0]).toMatchObject({ identityNumber: SAUDI_ID, contributoryWage: 10000, contributionType: "annuities_and_saned" });
    expect(payload.contributors[1]).toMatchObject({ identityNumber: IQAMA, identityType: "iqama", contributionType: "occupational_hazards" });
  });

  it("builds the wage file with bank code and account per worker", () => {
    const payload = buildMudadPayload({ establishment: { name: "Co", crNumber: "1", molNumber: "7", payerIban: null }, run, rows });
    expect(payload.workers[0]).toMatchObject({ bankCode: "80", iban: IBAN, netWage: 10220 });
    expect(payload.totals.net).toBe(20440);
    const lines = buildWageFileCsv(rows).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("10220.00");
  });

  it("names the employees whose records are incomplete", () => {
    const incomplete = buildFilingRows({ employees: [employee({ nationalId: null, iban: null })], items: [item({})], contracts });
    expect(findFilingIssues(incomplete, { requireIban: true }).map((issue) => issue.code)).toEqual(["IDENTITY_MISSING", "IBAN_MISSING"]);
    expect(findFilingIssues(incomplete, { requireIban: false }).map((issue) => issue.code)).toEqual(["IDENTITY_MISSING"]);
    expect(findFilingIssues(rows, { requireIban: true })).toEqual([]);
  });

  it("never files a draft payroll run", () => {
    const make = (id: string, status: PayrollRun["status"], periodEnd: string) => ({ id, status, periodEnd }) as PayrollRun;
    expect(findFilingRun([make("draft", "draft", "2026-05-31"), make("ok", "approved", "2026-04-30")])?.id).toBe("ok");
    expect(findFilingRun([make("draft", "draft", "2026-05-31")])).toBeNull();
  });
});
