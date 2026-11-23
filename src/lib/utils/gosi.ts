import type { PayrollSettings } from "@/lib/data/payroll-settings";

const SAUDI_NATIONALITIES = new Set([
  "sa",
  "sau",
  "ksa",
  "saudi",
  "saudi arabia",
  "saudi arabian",
  "kingdom of saudi arabia",
  "سعودي",
  "سعودية",
  "سعوديه",
  "السعودية",
  "السعوديه",
  "المملكة العربية السعودية",
]);

export const isSaudiNational = (employee: {
  nationality?: string | null;
  nationalId?: string | null;
  iqamaNumber?: string | null;
}) => {
  const nationality = (employee.nationality ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (nationality) {
    return SAUDI_NATIONALITIES.has(nationality);
  }
  // No nationality on file: national IDs start with 1, iqama numbers with 2.
  if ((employee.iqamaNumber ?? "").trim()) {
    return false;
  }
  return !(employee.nationalId ?? "").trim().startsWith("2");
};

export type GosiContribution = {
  base: number;
  employeeShare: number;
  employerShare: number;
};

/**
 * GOSI contributions are charged on basic salary plus housing only, capped at a
 * monthly ceiling. Saudis pay annuities and SANED; for non-Saudis the employer
 * alone pays occupational hazards.
 */
export const computeGosiContribution = (params: {
  basic: number;
  housingAllowance: number;
  isSaudi: boolean;
  prorationFactor?: number;
  settings: Pick<
    PayrollSettings,
    | "gosiEnabled"
    | "gosiEmployeeRate"
    | "gosiEmployerRate"
    | "gosiNonSaudiEmployerRate"
    | "gosiMinBase"
    | "gosiMaxBase"
  >;
}): GosiContribution => {
  const { settings } = params;
  const wage = params.basic + params.housingAllowance;
  if (!settings.gosiEnabled || wage <= 0) {
    return { base: 0, employeeShare: 0, employerShare: 0 };
  }

  const floor = params.isSaudi ? settings.gosiMinBase : 0;
  const monthlyBase = Math.min(Math.max(wage, floor), settings.gosiMaxBase);
  const base = monthlyBase * (params.prorationFactor ?? 1);
  const employeeRate = params.isSaudi ? settings.gosiEmployeeRate : 0;
  const employerRate = params.isSaudi
    ? settings.gosiEmployerRate
    : settings.gosiNonSaudiEmployerRate;

  return {
    base,
    employeeShare: base * (employeeRate / 100),
    employerShare: base * (employerRate / 100),
  };
};
