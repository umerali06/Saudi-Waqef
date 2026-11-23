import { getCompanyById } from "@/lib/data/companies";
import { getDepartmentById } from "@/lib/data/departments";
import { getDocumentBranding } from "@/lib/data/document-branding";
import { getEmployeeById } from "@/lib/data/employees";
import type { PayrollRunItem } from "@/lib/data/payroll-run-items";
import type { PayrollRun } from "@/lib/data/payroll-runs";
import { getPositionById } from "@/lib/data/positions";

export type Payslip = {
  id: string;
  employee: {
    nameAr: string;
    nameEn: string;
    employeeNumber: string | null;
    departmentAr: string | null;
    departmentEn: string | null;
    positionAr: string | null;
    positionEn: string | null;
  };
  item: PayrollRunItem;
};

export type PayslipDocument = {
  company: { name: string; logoUrl: string | null };
  run: Pick<PayrollRun, "id" | "periodStart" | "periodEnd" | "status">;
  payslips: Payslip[];
};

export async function buildPayslipDocument(
  run: PayrollRun,
  items: PayrollRunItem[]
): Promise<PayslipDocument> {
  const [company, branding, payslips] = await Promise.all([
    getCompanyById(run.companyId),
    getDocumentBranding(run.companyId),
    Promise.all(
      items.map(async (item) => {
        const employee = await getEmployeeById(item.employeeId);
        const [department, position] = await Promise.all([
          employee?.departmentId ? getDepartmentById(employee.departmentId) : null,
          employee?.positionId ? getPositionById(employee.positionId) : null,
        ]);
        return {
          id: item.id,
          employee: {
            nameAr: employee?.nameAr || employee?.nameEn || item.employeeId,
            nameEn: employee?.nameEn || employee?.nameAr || item.employeeId,
            employeeNumber: employee?.employeeNumber ?? null,
            departmentAr: department?.nameAr ?? null,
            departmentEn: department?.nameEn ?? null,
            positionAr: position?.nameAr ?? null,
            positionEn: position?.nameEn ?? null,
          },
          item,
        };
      })
    ),
  ]);

  return {
    company: { name: company?.name ?? "", logoUrl: branding.logoUrl ?? null },
    run: {
      id: run.id,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      status: run.status,
    },
    payslips: payslips.sort((a, b) => a.employee.nameEn.localeCompare(b.employee.nameEn)),
  };
}
