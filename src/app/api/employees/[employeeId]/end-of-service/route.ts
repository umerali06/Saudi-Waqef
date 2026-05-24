import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess } from "@/lib/access";
import { getEmployeeById } from "@/lib/data/employees";
import { getPayrollSettings } from "@/lib/data/payroll-settings";
import { listEmployeeContracts } from "@/lib/data/employee-contracts";
import { calculateEndOfServiceBenefit } from "@/lib/utils/end-of-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

const pickContract = (contracts: Awaited<ReturnType<typeof listEmployeeContracts>>) =>
  contracts.find((contract) => contract.status === "active") ?? contracts[0] ?? null;

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId } = await context.params;
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireHrAccess(user.id, employee.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [settings, contracts] = await Promise.all([
    getPayrollSettings(employee.companyId),
    listEmployeeContracts(employeeId),
  ]);
  const contract = pickContract(contracts);
  if (!contract) {
    return NextResponse.json({ summary: null });
  }

  const summary = calculateEndOfServiceBenefit({
    employee,
    contract,
    payrollSettings: settings,
  });

  return NextResponse.json({ summary });
}
