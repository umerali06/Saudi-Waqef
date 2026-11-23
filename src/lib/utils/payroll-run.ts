import type { EmployeeRecord } from "@/lib/data/employees";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import { roundMoney } from "@/lib/utils/invoice";

type PayrollPeriod = { periodStart: string; periodEnd: string };

/** Last day the employee can be paid for in the period, or null when not payable at all. */
export const getPayableUntil = (
  employee: Pick<EmployeeRecord, "status" | "terminationDate">,
  period: PayrollPeriod
) => {
  if (employee.status === "active") {
    return period.periodEnd;
  }
  if (employee.status === "terminated" && employee.terminationDate) {
    if (employee.terminationDate < period.periodStart) {
      return null;
    }
    return employee.terminationDate < period.periodEnd
      ? employee.terminationDate
      : period.periodEnd;
  }
  return null;
};

/**
 * Contract that governs pay in the period: never a draft, must overlap the payable range,
 * and an ended contract without an end date only counts for a terminated employee.
 */
export const pickPayrollContract = (
  contracts: EmployeeContractRecord[],
  params: { periodStart: string; payableUntil: string; isTerminated: boolean }
) => {
  const overlapping = contracts.filter((contract) => {
    if (contract.status === "draft") {
      return false;
    }
    if (contract.status === "ended" && !contract.endDate && !params.isTerminated) {
      return false;
    }
    return (
      (!contract.startDate || contract.startDate <= params.payableUntil) &&
      (!contract.endDate || contract.endDate >= params.periodStart)
    );
  });
  return (
    overlapping.find((contract) => contract.status === "active") ?? overlapping[0] ?? null
  );
};

export const capContractEnd = (
  contract: EmployeeContractRecord,
  payableUntil: string
): EmployeeContractRecord => ({
  ...contract,
  endDate:
    contract.endDate && contract.endDate < payableUntil ? contract.endDate : payableUntil,
});

export const periodsOverlap = (a: PayrollPeriod, b: PayrollPeriod) =>
  a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;

export const buildPayrollJournalLines = (params: {
  netPay: number;
  totalDeductions: number;
  gosiEmployer: number;
  accounts: {
    salaryExpenseAccountId: string;
    payrollPayableAccountId: string;
    salaryDeductionsAccountId: string | null;
    gosiExpenseAccountId: string | null;
    gosiPayableAccountId: string | null;
  };
}) => {
  const netPay = roundMoney(params.netPay);
  const deductions = roundMoney(params.totalDeductions);
  // Pay actually granted, adjustments included, so debits always match the credits below.
  const lines = [
    {
      accountId: params.accounts.salaryExpenseAccountId,
      debit: roundMoney(netPay + deductions),
      credit: 0,
    },
    { accountId: params.accounts.payrollPayableAccountId, debit: 0, credit: netPay },
  ];
  if (deductions > 0 && params.accounts.salaryDeductionsAccountId) {
    lines.push({
      accountId: params.accounts.salaryDeductionsAccountId,
      debit: 0,
      credit: deductions,
    });
  }
  const gosiEmployer = roundMoney(params.gosiEmployer);
  if (gosiEmployer > 0 && params.accounts.gosiPayableAccountId) {
    lines.push(
      {
        accountId:
          params.accounts.gosiExpenseAccountId ?? params.accounts.salaryExpenseAccountId,
        debit: gosiEmployer,
        credit: 0,
      },
      { accountId: params.accounts.gosiPayableAccountId, debit: 0, credit: gosiEmployer }
    );
  }
  return lines.filter((line) => line.debit > 0 || line.credit > 0);
};

export const isBalancedJournal = (lines: Array<{ debit: number; credit: number }>) =>
  Math.abs(
    lines.reduce((sum, line) => sum + line.debit - line.credit, 0)
  ) < 0.005;
