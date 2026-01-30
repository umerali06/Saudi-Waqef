import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess } from "@/lib/access";
import { listDepartments } from "@/lib/data/departments";
import { listEmployees } from "@/lib/data/employees";
import { toCsv } from "@/lib/utils/csv";

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

  const [departments, employees] = await Promise.all([
    listDepartments(companyId),
    listEmployees(companyId),
  ]);

  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const headers = [
    "code",
    "nameAr",
    "nameEn",
    "managerNameAr",
    "managerNameEn",
    "status",
    "notes",
  ];
  const rows = departments.map((department) => {
    const manager = department.managerId ? employeeMap.get(department.managerId) : null;
    return [
      department.code ?? "",
      department.nameAr ?? "",
      department.nameEn ?? "",
      manager?.nameAr ?? "",
      manager?.nameEn ?? "",
      department.status ?? "",
      department.notes ?? "",
    ];
  });

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=departments.csv",
      "Cache-Control": "no-store",
    },
  });
}
