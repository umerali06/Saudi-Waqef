import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess } from "@/lib/access";
import { listEmployees } from "@/lib/data/employees";
import { listDepartments } from "@/lib/data/departments";
import { listPositions } from "@/lib/data/positions";
import { normalizeSearch } from "@/lib/utils/search";
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

  const status = searchParams.get("status");
  const departmentId = searchParams.get("departmentId");
  const positionId = searchParams.get("positionId");
  const managerId = searchParams.get("managerId");
  const query = normalizeSearch(searchParams.get("q") ?? "");

  const [employees, departments, positions] = await Promise.all([
    listEmployees(companyId),
    listDepartments(companyId),
    listPositions(companyId),
  ]);

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

  const departmentMap = new Map(departments.map((dept) => [dept.id, dept]));
  const positionMap = new Map(positions.map((pos) => [pos.id, pos]));
  const employeeMap = new Map(employees.map((emp) => [emp.id, emp]));

  const headers = [
    "employeeNumber",
    "nameAr",
    "nameEn",
    "email",
    "phone",
    "departmentNameAr",
    "departmentNameEn",
    "positionNameAr",
    "positionNameEn",
    "managerNameAr",
    "managerNameEn",
    "status",
    "hireDate",
    "employmentType",
    "nationalId",
    "iqamaNumber",
    "passportNumber",
    "nationality",
    "dob",
    "gender",
    "address",
  ];

  const rows = filtered.map((employee) => {
    const department = employee.departmentId
      ? departmentMap.get(employee.departmentId)
      : null;
    const position = employee.positionId ? positionMap.get(employee.positionId) : null;
    const manager = employee.managerId ? employeeMap.get(employee.managerId) : null;
    return [
      employee.employeeNumber ?? "",
      employee.nameAr ?? "",
      employee.nameEn ?? "",
      employee.email ?? "",
      employee.phone ?? "",
      department?.nameAr ?? "",
      department?.nameEn ?? "",
      position?.nameAr ?? "",
      position?.nameEn ?? "",
      manager?.nameAr ?? "",
      manager?.nameEn ?? "",
      employee.status ?? "",
      employee.hireDate ?? "",
      employee.employmentType ?? "",
      employee.nationalId ?? "",
      employee.iqamaNumber ?? "",
      employee.passportNumber ?? "",
      employee.nationality ?? "",
      employee.dob ?? "",
      employee.gender ?? "",
      employee.address ?? "",
    ];
  });

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=employees.csv",
      "Cache-Control": "no-store",
    },
  });
}
