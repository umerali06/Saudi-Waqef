import { NextResponse } from "next/server";
import { buildHrReport } from "@/lib/reports/hr-reports";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:hr"], async ({ companyId }) => {
    const { searchParams } = new URL(request.url);
    const report = await buildHrReport({
      companyId,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      departmentId: searchParams.get("departmentId"),
    });

    return NextResponse.json({ data: report });
  });
}
