import type { EmployeeRecord, TerminationCategory } from "@/lib/data/employees";
import type { EmployeeContractRecord } from "@/lib/data/employee-contracts";
import type { PayrollSettings } from "@/lib/data/payroll-settings";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

export type EndOfServiceResult = {
  eligible: boolean;
  basis: "actual" | "basic";
  monthlyWage: number;
  serviceDays: number;
  serviceYears: number;
  awardBeforeAdjustment: number;
  adjustmentFactor: number;
  awardAmount: number;
  terminationCategory: TerminationCategory;
};

export const calculateServiceDays = (startDate: string, endDate: string) => {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
};

const getTerminationCategory = (employee: EmployeeRecord): TerminationCategory => {
  if (employee.terminationCategory) {
    return employee.terminationCategory;
  }

  const reason = employee.terminationReason?.toLowerCase() ?? "";
  if (reason.includes("resign") || reason.includes("استقال")) {
    return "resignation";
  }
  if (reason.includes("retir")) {
    return "retirement";
  }
  if (reason.includes("contract")) {
    return "contract_end";
  }
  return "employer_termination";
};

const getAdjustmentFactor = (serviceYears: number, category: TerminationCategory) => {
  if (category === "resignation") {
    if (serviceYears < 2) {
      return 0;
    }
    if (serviceYears < 5) {
      return 1 / 3;
    }
    if (serviceYears < 10) {
      return 2 / 3;
    }
  }
  return 1;
};

export const calculateEndOfServiceBenefit = (params: {
  employee: EmployeeRecord;
  contract: EmployeeContractRecord;
  payrollSettings: PayrollSettings;
  asOfDate?: string | null;
}): EndOfServiceResult => {
  const serviceStart = params.contract.startDate ?? params.employee.hireDate;
  const serviceEnd =
    params.employee.terminationDate ?? params.contract.endDate ?? params.asOfDate ?? null;
  const terminationCategory = getTerminationCategory(params.employee);
  const basis = params.payrollSettings.eosbWageBasis ?? "actual";
  const monthlyWage =
    basis === "basic"
      ? params.contract.salary.basic
      : params.contract.salary.basic +
        params.contract.salary.housingAllowance +
        params.contract.salary.transportAllowance +
        params.contract.salary.otherAllowance;

  if (!params.payrollSettings.eosbEnabled || !serviceStart || !serviceEnd || monthlyWage <= 0) {
    return {
      eligible: false,
      basis,
      monthlyWage,
      serviceDays: 0,
      serviceYears: 0,
      awardBeforeAdjustment: 0,
      adjustmentFactor: 0,
      awardAmount: 0,
      terminationCategory,
    };
  }

  const serviceDays = calculateServiceDays(serviceStart, serviceEnd);
  const serviceYears = serviceDays / 365;
  const firstFiveYears = Math.min(serviceYears, 5);
  const subsequentYears = Math.max(serviceYears - 5, 0);
  const awardBeforeAdjustment =
    monthlyWage * (firstFiveYears * 0.5 + subsequentYears);
  const adjustmentFactor = getAdjustmentFactor(serviceYears, terminationCategory);
  const awardAmount = awardBeforeAdjustment * adjustmentFactor;

  return {
    eligible: serviceDays > 0,
    basis,
    monthlyWage,
    serviceDays,
    serviceYears,
    awardBeforeAdjustment,
    adjustmentFactor,
    awardAmount,
    terminationCategory,
  };
};
