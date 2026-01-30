import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { departmentSchema } from "@/lib/validators/hr";
import { createDepartment, listDepartments } from "@/lib/data/departments";
import { getEmployeeById } from "@/lib/data/employees";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";

export const runtime = "nodejs";

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

  const membership = await requireHrAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const departments = await listDepartments(companyId);
  return NextResponse.json({ departments });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = departmentSchema.safeParse(body);
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

  if (parsed.data.managerId) {
    const manager = await getEmployeeById(parsed.data.managerId);
    if (!manager || manager.companyId !== parsed.data.companyId) {
      return NextResponse.json({ error: "Invalid manager" }, { status: 400 });
    }
  }

  const existing = await listDepartments(parsed.data.companyId);
  const nameAr = normalizeSearch(parsed.data.nameAr);
  const nameEn = normalizeSearch(parsed.data.nameEn);
  const code = normalizeSearch(parsed.data.code ?? "");
  const duplicate = existing.find((department) => {
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

  const departmentId = await createDepartment({
    companyId: parsed.data.companyId,
    nameAr: parsed.data.nameAr,
    nameEn: parsed.data.nameEn,
    code: parsed.data.code ?? null,
    managerId: parsed.data.managerId ?? null,
    status: parsed.data.status ?? "active",
    notes: parsed.data.notes ?? null,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "department.create",
    entity: "department",
    entityId: departmentId,
    metadata: { nameAr: parsed.data.nameAr, nameEn: parsed.data.nameEn },
  });

  return NextResponse.json({ departmentId });
}

