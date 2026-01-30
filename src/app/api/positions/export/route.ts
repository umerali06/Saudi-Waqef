import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess } from "@/lib/access";
import { listPositions } from "@/lib/data/positions";
import { listDepartments } from "@/lib/data/departments";
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

  const [positions, departments] = await Promise.all([
    listPositions(companyId),
    listDepartments(companyId),
  ]);

  const departmentMap = new Map(departments.map((department) => [department.id, department]));
  const headers = [
    "code",
    "nameAr",
    "nameEn",
    "departmentNameAr",
    "departmentNameEn",
    "status",
    "notes",
  ];
  const rows = positions.map((position) => {
    const department = position.departmentId
      ? departmentMap.get(position.departmentId)
      : null;
    return [
      position.code ?? "",
      position.nameAr ?? "",
      position.nameEn ?? "",
      department?.nameAr ?? "",
      department?.nameEn ?? "",
      position.status ?? "",
      position.notes ?? "",
    ];
  });

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=positions.csv",
      "Cache-Control": "no-store",
    },
  });
}
