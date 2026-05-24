import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { employeeSchema, employeeUpdateSchema } from "@/lib/validators/hr";
import { getEmployeeById, listEmployees, updateEmployee } from "@/lib/data/employees";
import { getDepartmentById } from "@/lib/data/departments";
import { getPositionById } from "@/lib/data/positions";
import { getMembership } from "@/lib/data/memberships";
import { createEmployeeTransfer } from "@/lib/data/employee-transfers";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";
import { redactEmployeePII } from "@/lib/security/pii";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

const PRIVILEGED_ROLES = ["owner", "admin", "hr"];

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

  if (!PRIVILEGED_ROLES.includes(membership.role)) {
    if (employee.userId === user.id) {
      return NextResponse.json({ employee });
    }
    const employees = await listEmployees(employee.companyId);
    const selfRecord = employees.find((entry) => entry.userId === user.id);
    if (selfRecord && employee.managerId === selfRecord.id) {
      return NextResponse.json({
        employee: redactEmployeePII(employee, membership.role, {
          isSelf: false,
        }),
      });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ employee });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId } = await context.params;
  const current = await getEmployeeById(employeeId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = employeeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, current.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.departmentId) {
    const department = await getDepartmentById(parsed.data.departmentId);
    if (!department || department.companyId !== current.companyId) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }
  }
  if (parsed.data.positionId) {
    const position = await getPositionById(parsed.data.positionId);
    if (!position || position.companyId !== current.companyId) {
      return NextResponse.json({ error: "Invalid position" }, { status: 400 });
    }
  }
  if (parsed.data.managerId) {
    const employees = await listEmployees(current.companyId);
    const manager = employees.find((entry) => entry.id === parsed.data.managerId);
    if (!manager) {
      return NextResponse.json({ error: "Invalid manager" }, { status: 400 });
    }
  }
  if (parsed.data.userId) {
    const linked = await getMembership({
      userId: parsed.data.userId,
      companyId: current.companyId,
    });
    if (!linked) {
      return NextResponse.json({ error: "Invalid user" }, { status: 400 });
    }
  }

  const updates = {
    ...parsed.data,
    onboarding: parsed.data.onboarding?.map((task) => ({
      ...task,
      completed: task.completed ?? false,
    })),
  };
  const transferReason = updates.transferReason ?? null;
  const transferEffectiveDate = updates.transferEffectiveDate ?? null;
  delete updates.transferReason;
  delete updates.transferEffectiveDate;

  const merged = {
    ...current,
    ...updates,
    companyId: current.companyId,
  };
  const mergedValidation = employeeSchema.safeParse(merged);
  if (!mergedValidation.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (merged.status !== "terminated") {
    updates.terminationDate = null;
    updates.terminationCategory = null;
    updates.terminationReason = null;
  }

  const employees = await listEmployees(current.companyId);
  const employeeNumber = normalizeSearch(merged.employeeNumber ?? "");
  const nationalId = normalizeSearch(merged.nationalId ?? "");
  const iqamaNumber = normalizeSearch(merged.iqamaNumber ?? "");
  const email = normalizeSearch(merged.email ?? "");
  const duplicate = employees.find((employee) => {
    if (employee.id === employeeId) {
      return false;
    }
    if (employeeNumber && normalizeSearch(employee.employeeNumber ?? "") === employeeNumber) {
      return true;
    }
    if (nationalId && normalizeSearch(employee.nationalId ?? "") === nationalId) {
      return true;
    }
    if (iqamaNumber && normalizeSearch(employee.iqamaNumber ?? "") === iqamaNumber) {
      return true;
    }
    if (email && normalizeSearch(employee.email ?? "") === email) {
      return true;
    }
    return false;
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate employee" }, { status: 409 });
  }

  const nextDepartmentId =
    updates.departmentId !== undefined ? updates.departmentId : current.departmentId;
  const nextPositionId =
    updates.positionId !== undefined ? updates.positionId : current.positionId;
  const changedDepartment = nextDepartmentId !== current.departmentId;
  const changedPosition = nextPositionId !== current.positionId;

  await updateEmployee(employeeId, updates);

  if (changedDepartment || changedPosition) {
    await createEmployeeTransfer({
      companyId: current.companyId,
      employeeId,
      fromDepartmentId: current.departmentId ?? null,
      toDepartmentId: nextDepartmentId ?? null,
      fromPositionId: current.positionId ?? null,
      toPositionId: nextPositionId ?? null,
      effectiveDate:
        transferEffectiveDate || new Date().toISOString().slice(0, 10),
      reason: transferReason,
      createdBy: user.id,
    });
  }

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "employee.update",
    entity: "employee",
    entityId: employeeId,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

