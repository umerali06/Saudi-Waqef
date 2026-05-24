import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership, requireCompanyRole } from "@/lib/access";
import { employeeSchema } from "@/lib/validators/hr";
import { createEmployee, listEmployees } from "@/lib/data/employees";
import { getDepartmentById } from "@/lib/data/departments";
import { getPositionById } from "@/lib/data/positions";
import { getMembership } from "@/lib/data/memberships";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";
import { redactEmployeePII } from "@/lib/security/pii";

export const runtime = "nodejs";

const PRIVILEGED_ROLES = ["owner", "admin", "hr"];

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await listEmployees(companyId);
  const scope = searchParams.get("scope");
  const status = searchParams.get("status");
  const departmentId = searchParams.get("departmentId");
  const positionId = searchParams.get("positionId");
  const managerId = searchParams.get("managerId");
  const query = normalizeSearch(searchParams.get("q") ?? "");

  const isPrivileged = PRIVILEGED_ROLES.includes(membership.role);
  if (!isPrivileged) {
    const selfRecord = employees.find((entry) => entry.userId === user.id);
    if (scope === "team" && selfRecord) {
      const team = employees.filter((entry) => entry.managerId === selfRecord.id);
      return NextResponse.json({
        employees: team.map((entry) =>
          redactEmployeePII(entry, membership.role, {
            isSelf: entry.userId === user.id,
          })
        ),
      });
    }
    return NextResponse.json({
      employees: selfRecord
        ? [
            redactEmployeePII(selfRecord, membership.role, {
              isSelf: true,
            }),
          ]
        : [],
    });
  }

  let filtered = employees;
  if (status && status !== "all") {
    filtered = filtered.filter((employee) => employee.status === status);
  }
  if (departmentId && departmentId !== "all") {
    filtered = filtered.filter((employee) => employee.departmentId === departmentId);
  }
  if (positionId && positionId !== "all") {
    filtered = filtered.filter((employee) => employee.positionId === positionId);
  }
  if (managerId) {
    filtered = filtered.filter((employee) => employee.managerId === managerId);
  }
  if (query) {
    filtered = filtered.filter((employee) => {
      const nameAr = normalizeSearch(employee.nameAr);
      const nameEn = normalizeSearch(employee.nameEn);
      const number = normalizeSearch(employee.employeeNumber ?? "");
      const email = normalizeSearch(employee.email ?? "");
      const phone = normalizeSearch(employee.phone ?? "");
      const nationalId = normalizeSearch(employee.nationalId ?? "");
      const iqamaNumber = normalizeSearch(employee.iqamaNumber ?? "");
      return (
        nameAr.includes(query) ||
        nameEn.includes(query) ||
        number.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        nationalId.includes(query) ||
        iqamaNumber.includes(query)
      );
    });
  }

  return NextResponse.json({ employees: filtered });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = employeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.departmentId) {
    const department = await getDepartmentById(parsed.data.departmentId);
    if (!department || department.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }
  }
  if (parsed.data.positionId) {
    const position = await getPositionById(parsed.data.positionId);
    if (!position || position.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid position" }, { status: 400 });
    }
  }
  if (parsed.data.managerId) {
    const manager = await listEmployees(parsed.data.companyId);
    const match = manager.find((entry) => entry.id === parsed.data.managerId);
    if (!match) {
      return NextResponse.json({ error: "Invalid manager" }, { status: 400 });
    }
  }
  if (parsed.data.userId) {
    const linked = await getMembership({
      userId: parsed.data.userId,
      companyId: parsed.data.companyId,
    });
    if (!linked) {
      return NextResponse.json({ error: "Invalid user" }, { status: 400 });
    }
  }

  const existing = await listEmployees(parsed.data.companyId);
  const employeeNumber = normalizeSearch(parsed.data.employeeNumber ?? "");
  const nationalId = normalizeSearch(parsed.data.nationalId ?? "");
  const iqamaNumber = normalizeSearch(parsed.data.iqamaNumber ?? "");
  const email = normalizeSearch(parsed.data.email ?? "");
  const duplicate = existing.find((employee) => {
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

  const onboarding = (parsed.data.onboarding ?? []).map((task) => ({
    ...task,
    completed: Boolean(task.completed),
  }));

  const employeeId = await createEmployee({
    companyId: parsed.data.companyId,
    employeeNumber: parsed.data.employeeNumber ?? null,
    nameAr: parsed.data.nameAr,
    nameEn: parsed.data.nameEn,
    nationalId: parsed.data.nationalId ?? null,
    iqamaNumber: parsed.data.iqamaNumber ?? null,
    passportNumber: parsed.data.passportNumber ?? null,
    nationality: parsed.data.nationality ?? null,
    dob: parsed.data.dob ?? null,
    gender: parsed.data.gender ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
    hireDate: parsed.data.hireDate ?? null,
    departmentId: parsed.data.departmentId ?? null,
    positionId: parsed.data.positionId ?? null,
    managerId: parsed.data.managerId ?? null,
    userId: parsed.data.userId ?? null,
    employmentType: parsed.data.employmentType ?? null,
    status: parsed.data.status ?? "active",
    terminationDate: parsed.data.terminationDate ?? null,
    terminationCategory: parsed.data.terminationCategory ?? null,
    terminationReason: parsed.data.terminationReason ?? null,
    notes: parsed.data.notes ?? null,
    onboarding,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "employee.create",
    entity: "employee",
    entityId: employeeId,
    metadata: { nameAr: parsed.data.nameAr, nameEn: parsed.data.nameEn },
  });

  return NextResponse.json({ employeeId });
}

