import { hasRequiredRole, requireCompanyMembership } from "@/lib/access";
import { getEmployeeByUserId } from "@/lib/data/employees";
import { getPayrollRunItem } from "@/lib/data/payroll-run-items";
import { getPayrollRun } from "@/lib/data/payroll-runs";

/**
 * HR sees every payslip. An employee sees their own, once the run has been approved.
 */
export async function getAccessiblePayslip(userId: string, runItemId: string) {
  const item = await getPayrollRunItem(runItemId);
  if (!item) {
    return null;
  }
  const membership = await requireCompanyMembership(userId, item.companyId);
  const run = membership ? await getPayrollRun(item.runId) : null;
  if (!membership || !run || run.companyId !== item.companyId) {
    return null;
  }
  if (!hasRequiredRole(membership.role, ["owner", "admin", "hr"])) {
    const employee = await getEmployeeByUserId(item.companyId, userId);
    if (!employee || employee.id !== item.employeeId || run.status === "draft") {
      return null;
    }
  }
  return { item, run };
}
