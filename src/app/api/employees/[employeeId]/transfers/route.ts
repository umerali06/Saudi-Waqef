import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getEmployeeById, listEmployees } from "@/lib/data/employees";
import { listEmployeeTransfers } from "@/lib/data/employee-transfers";

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

  const membership = await requireAccountingAccess(user.id, employee.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["owner", "admin", "hr"].includes(membership.role)) {
    if (employee.userId !== user.id) {
      const employees = await listEmployees(employee.companyId);
      const selfRecord = employees.find((entry) => entry.userId === user.id);
      if (!selfRecord || employee.managerId !== selfRecord.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const transfers = await listEmployeeTransfers(employeeId);
  return NextResponse.json({ transfers });
}

