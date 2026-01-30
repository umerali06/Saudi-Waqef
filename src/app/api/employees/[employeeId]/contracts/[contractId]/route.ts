import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { contractSchema, contractUpdateSchema } from "@/lib/validators/hr";
import {
  endOtherActiveContracts,
  getEmployeeContractById,
  updateEmployeeContract,
} from "@/lib/data/employee-contracts";
import { getEmployeeById } from "@/lib/data/employees";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ employeeId: string; contractId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId, contractId } = await context.params;
  const contract = await getEmployeeContractById(contractId);
  if (!contract || contract.employeeId !== employeeId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const employee = await getEmployeeById(employeeId);
  if (!employee || employee.companyId !== contract.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = contractUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, employee.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const merged = {
    ...contract,
    ...parsed.data,
    companyId: contract.companyId,
  };
  const mergedValidation = contractSchema.safeParse(merged);
  if (!mergedValidation.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await updateEmployeeContract(contractId, parsed.data);

  if (merged.status === "active") {
    await endOtherActiveContracts(employeeId, contractId);
  }

  await recordAuditEvent({
    companyId: employee.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "employee.contract.update",
    entity: "employee_contract",
    entityId: contractId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}
