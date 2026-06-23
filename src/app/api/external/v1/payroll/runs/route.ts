import { NextResponse } from "next/server";
import { listPayrollRuns } from "@/lib/data/payroll-runs";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:hr"], async ({ companyId }) => {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let runs = await listPayrollRuns(companyId);
    if (status && status !== "all") {
      runs = runs.filter((run) => run.status === status);
    }
    if (startDate) {
      runs = runs.filter((run) => run.periodEnd >= startDate);
    }
    if (endDate) {
      runs = runs.filter((run) => run.periodStart <= endDate);
    }

    return NextResponse.json({ data: runs });
  });
}
