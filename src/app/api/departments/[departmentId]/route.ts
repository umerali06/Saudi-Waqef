import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { departmentSchema, departmentUpdateSchema } from "@/lib/validators/hr";
import { getDepartmentById, listDepartments, updateDepartment } from "@/lib/data/departments";
import { getEmployeeById } from "@/lib/data/employees";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ departmentId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { departmentId } = await context.params;
  const department = await getDepartmentById(departmentId);
  if (!department) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireHrAccess(user.id, department.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ department });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { departmentId } = await context.params;
  const current = await getDepartmentById(departmentId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = departmentUpdateSchema.safeParse(body);
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

  if (parsed.data.managerId) {
    const manager = await getEmployeeById(parsed.data.managerId);
    if (!manager || manager.companyId !== current.companyId) {
      return NextResponse.json({ error: "Invalid manager" }, { status: 400 });
    }
  }

  const merged = {
    ...current,
    ...parsed.data,
    companyId: current.companyId,
  };
  const mergedValidation = departmentSchema.safeParse(merged);
  if (!mergedValidation.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await listDepartments(current.companyId);
  const nameAr = normalizeSearch(merged.nameAr);
  const nameEn = normalizeSearch(merged.nameEn);
  const code = normalizeSearch(merged.code ?? "");
  const duplicate = existing.find((department) => {
    if (department.id === departmentId) {
      return false;
    }
    if (code && normalizeSearch(department.code ?? "") === code) {
      return true;
    }
    return (
      normalizeSearch(department.nameAr) === nameAr ||
      normalizeSearch(department.nameEn) === nameEn
    );
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate department" }, { status: 409 });
  }

  await updateDepartment(departmentId, parsed.data);

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "department.update",
    entity: "department",
    entityId: departmentId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

