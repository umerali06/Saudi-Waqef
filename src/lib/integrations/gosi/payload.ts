import type { PayrollRun } from "@/lib/data/payroll-runs";
import type { PayrollFilingRow } from "@/lib/integrations/payroll-source";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Monthly contribution schedule: one row per contributor, plus the totals GOSI invoices. */
export const buildGosiPayload = (params: {
  establishment: { name: string; crNumber: string | null; gosiNumber: string | null };
  run: Pick<PayrollRun, "id" | "periodStart" | "periodEnd">;
  rows: PayrollFilingRow[];
}) => {
  const contributors = params.rows.map((row) => ({
    identityNumber: row.identityNumber,
    identityType: row.isSaudi ? "national_id" : "iqama",
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    nationality: row.nationality,
    birthDate: row.birthDate,
    joiningDate: row.hireDate,
    leavingDate: row.terminationDate,
    contributionType: row.isSaudi ? "annuities_and_saned" : "occupational_hazards",
    basicWage: row.basic,
    housingAllowance: row.housing,
    contributoryWage: round2(row.basic + row.housing),
    employeeContribution: row.gosiEmployee,
    employerContribution: row.gosiEmployer,
    totalContribution: round2(row.gosiEmployee + row.gosiEmployer),
  }));
  const total = (key: "employeeContribution" | "employerContribution" | "totalContribution") =>
    round2(contributors.reduce((sum, row) => sum + row[key], 0));

  return {
    source: "saudi-waqef",
    connector: "gosi",
    establishment: params.establishment,
    contributionMonth: params.run.periodEnd.slice(0, 7),
    payrollRunId: params.run.id,
    contributorCount: contributors.length,
    saudiCount: contributors.filter((row) => row.identityType === "national_id").length,
    totals: {
      employee: total("employeeContribution"),
      employer: total("employerContribution"),
      payable: total("totalContribution"),
    },
    contributors,
  };
};
