import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { contractSchema } from "@/lib/validators/hr";
import {
  createEmployeeContract,
  endOtherActiveContracts,
  listEmployeeContracts,
} from "@/lib/data/employee-contracts";
import { getEmployeeById } from "@/lib/data/employees";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

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

  if (!["owner", "admin", "hr"].includes(membership.role)) {
    if (employee.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const contracts = await listEmployeeContracts(employeeId);
  return NextResponse.json({ contracts });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId } = await context.params;
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = contractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== employee.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, employee.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contractId = await createEmployeeContract({
    companyId: employee.companyId,
    employeeId,
    type: parsed.data.type,
    status: parsed.data.status,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    probationEndDate: parsed.data.probationEndDate ?? null,
    salary: {
      basic: parsed.data.salary.basic,
      housingAllowance: parsed.data.salary.housingAllowance,
      transportAllowance: parsed.data.salary.transportAllowance,
      otherAllowance: parsed.data.salary.otherAllowance,
      deductions: parsed.data.salary.deductions,
      currency: parsed.data.salary.currency ?? "SAR",
    },
    notes: parsed.data.notes ?? null,
  });

  if (parsed.data.status === "active") {
    await endOtherActiveContracts(employeeId, contractId);
  }

  await recordAuditEvent({
    companyId: employee.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "employee.contract.create",
    entity: "employee_contract",
    entityId: contractId,
    metadata: { employeeId },
  });

  return NextResponse.json({ contractId });
}

