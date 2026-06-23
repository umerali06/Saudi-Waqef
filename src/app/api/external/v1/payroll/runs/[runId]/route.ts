import { NextResponse } from "next/server";
import { getPayrollRun } from "@/lib/data/payroll-runs";
import { listPayrollRunItems } from "@/lib/data/payroll-run-items";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

const includeItems = (request: Request) =>
  new URL(request.url).searchParams.get("includeItems") !== "false";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  return withExternalApiAuth(request, ["read:hr"], async ({ companyId }) => {
    const { runId } = await params;
    const run = await getPayrollRun(runId);
    if (!run || run.companyId !== companyId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const items = includeItems(request) ? await listPayrollRunItems(run.id) : undefined;
    return NextResponse.json({ data: { ...run, items } });
  });
}
