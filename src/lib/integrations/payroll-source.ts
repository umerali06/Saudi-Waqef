import type { EmployeeRecord } from "@/lib/data/employees";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import type { PayrollRun } from "@/lib/data/payroll-runs";
import type { PayrollRunItem } from "@/lib/data/payroll-run-items";
import { isSaudiNational } from "@/lib/utils/gosi";
import { isValidSaudiIban, normalizeIban } from "@/lib/utils/iban";

/** One employee's approved pay for one run, as government filings need it. */
export type PayrollFilingRow = {
  employeeId: string;
  employeeNumber: string | null;
  nameAr: string;
  nameEn: string;
  /** National ID for Saudis, iqama for residents. */
  identityNumber: string;
  isSaudi: boolean;
  nationality: string | null;
  birthDate: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  iban: string;
  basic: number;
  housing: number;
  otherEarnings: number;
  deductions: number;
  net: number;
  gosiEmployee: number;
  gosiEmployer: number;
};

export type PayrollFilingIssue = {
  employeeId: string;
  employeeName: string;
  code: "IDENTITY_MISSING" | "IDENTITY_INVALID" | "IBAN_MISSING" | "IBAN_INVALID" | "NET_NEGATIVE";
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const digitsOnly = (value?: string | null) =>
  (value ?? "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/\D/g, "");

/** Saudi identity numbers: ten digits starting with 1 (citizen) or 2 (resident), Luhn checked. */
export const isValidSaudiIdentity = (value: string) => {
  if (!/^[12]\d{9}$/.test(value)) return false;
  const sum = [...value].reduce((total, char, index) => {
    const digit = Number(char);
    if (index % 2 === 1) return total + digit;
    const doubled = digit * 2;
    return total + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return sum % 10 === 0;
};

export const findFilingRun = (runs: PayrollRun[]) =>
  [...runs]
    // Draft payroll has not been agreed by anyone and must never reach an authority.
    .filter((run) => run.status === "approved" || run.status === "paid")
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0] ?? null;

export const buildFilingRows = (params: {
  employees: EmployeeRecord[];
  items: PayrollRunItem[];
  contracts: Map<string, EmployeeContractRecord | null>;
}): PayrollFilingRow[] => {
  const employees = new Map(params.employees.map((employee) => [employee.id, employee]));
  return params.items.flatMap((item) => {
    const employee = employees.get(item.employeeId);
    if (!employee) return [];
    const contract = params.contracts.get(item.contractId);
    const basic = round2(item.baseSalary);
    const housing = Math.min(
      round2((contract?.salary.housingAllowance ?? 0) * (item.prorationFactor || 1)),
      round2(item.allowances)
    );
    const net = round2(item.netPay);
    const deductions = round2(item.totalDeductions);
    return [
      {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber ?? null,
        nameAr: employee.nameAr,
        nameEn: employee.nameEn,
        identityNumber: digitsOnly(employee.nationalId) || digitsOnly(employee.iqamaNumber),
        isSaudi: isSaudiNational(employee),
        nationality: employee.nationality ?? null,
        birthDate: employee.dob ?? null,
        hireDate: employee.hireDate ?? null,
        terminationDate: employee.terminationDate ?? null,
        iban: normalizeIban(employee.iban),
        basic,
        housing,
        // Derived, so basic + housing + other - deductions always equals net.
        otherEarnings: round2(net + deductions - basic - housing),
        deductions,
        net,
        gosiEmployee: round2(item.gosiDeduction),
        gosiEmployer: round2(item.gosiEmployerContribution),
      },
    ];
  });
};

export const findFilingIssues = (
  rows: PayrollFilingRow[],
  options: { requireIban: boolean }
): PayrollFilingIssue[] =>
  rows.flatMap((row) => {
    const issue = (code: PayrollFilingIssue["code"]): PayrollFilingIssue => ({
      employeeId: row.employeeId,
      employeeName: row.nameAr || row.nameEn,
      code,
    });
    const issues: PayrollFilingIssue[] = [];
    if (!row.identityNumber) issues.push(issue("IDENTITY_MISSING"));
    else if (!isValidSaudiIdentity(row.identityNumber)) issues.push(issue("IDENTITY_INVALID"));
    if (options.requireIban) {
      if (!row.iban) issues.push(issue("IBAN_MISSING"));
      else if (!isValidSaudiIban(row.iban)) issues.push(issue("IBAN_INVALID"));
    }
    if (row.net < 0) issues.push(issue("NET_NEGATIVE"));
    return issues;
  });

export const describeFilingIssues = (issues: PayrollFilingIssue[]) =>
  `PAYROLL_FILING_INCOMPLETE: ${issues
    .map((issue) => `${issue.employeeName} (${issue.code})`)
    .join("; ")}`;
