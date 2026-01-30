import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireReportAccess } from "@/lib/access";
import { listReportExports } from "@/lib/data/report-exports";

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

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isPrivileged = hasRequiredRole(membership.role, ["owner", "admin", "accountant"]);
  const requestedUserId = searchParams.get("userId");
  const userId = isPrivileged ? requestedUserId : user.id;

  const exports = await listReportExports({
    companyId,
    reportType: searchParams.get("reportType"),
    format: searchParams.get("format"),
    userId,
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    limit: Number(searchParams.get("limit") ?? "200"),
  });

  return NextResponse.json({ exports });
}
