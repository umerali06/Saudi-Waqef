import type { PayrollRun } from "@/lib/data/payroll-runs";
import type { PayrollFilingRow } from "@/lib/integrations/payroll-source";
import { toCsv } from "@/lib/utils/csv";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The bank that holds the account is encoded in digits 5-6 of a Saudi IBAN. */
const bankCodeOf = (iban: string) => iban.slice(4, 6);

/** Wage Protection System record: what each worker is paid, into which account. */
export const buildMudadPayload = (params: {
  establishment: { name: string; crNumber: string | null; molNumber: string | null; payerIban: string | null };
  run: Pick<PayrollRun, "id" | "periodStart" | "periodEnd">;
  rows: PayrollFilingRow[];
}) => {
  const workers = params.rows.map((row) => ({
    identityNumber: row.identityNumber,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    iban: row.iban,
    bankCode: bankCodeOf(row.iban),
    basicWage: row.basic,
    housingAllowance: row.housing,
    otherEarnings: row.otherEarnings,
    deductions: row.deductions,
    netWage: row.net,
    currency: "SAR",
  }));
  const total = (key: "basicWage" | "housingAllowance" | "otherEarnings" | "deductions" | "netWage") =>
    round2(workers.reduce((sum, row) => sum + row[key], 0));

  return {
    source: "saudi-waqef",
    connector: "mudad",
    establishment: params.establishment,
    wageMonth: params.run.periodEnd.slice(0, 7),
    periodStart: params.run.periodStart,
    periodEnd: params.run.periodEnd,
    payrollRunId: params.run.id,
    workerCount: workers.length,
    totals: {
      basic: total("basicWage"),
      housing: total("housingAllowance"),
      otherEarnings: total("otherEarnings"),
      deductions: total("deductions"),
      net: total("netWage"),
    },
    workers,
  };
};

/** Wage file for upload through the Mudad portal or the employer's bank. */
export const buildWageFileCsv = (rows: PayrollFilingRow[]) =>
  toCsv(
    [
      "Identity Number",
      "Employee Name",
      "Bank Code",
      "IBAN",
      "Basic Salary",
      "Housing Allowance",
      "Other Earnings",
      "Deductions",
      "Net Salary",
      "Currency",
    ],
    rows.map((row) => [
      row.identityNumber,
      row.nameEn || row.nameAr,
      bankCodeOf(row.iban),
      row.iban,
      row.basic.toFixed(2),
      row.housing.toFixed(2),
      row.otherEarnings.toFixed(2),
      row.deductions.toFixed(2),
      row.net.toFixed(2),
      "SAR",
    ])
  );
