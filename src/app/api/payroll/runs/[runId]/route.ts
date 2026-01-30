import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess } from "@/lib/access";
import { getPayrollRun } from "@/lib/data/payroll-runs";
import { listPayrollRunItems } from "@/lib/data/payroll-run-items";
import { listPayrollAdjustments } from "@/lib/data/payroll-adjustments";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
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

  const { runId } = await context.params;
  const run = await getPayrollRun(runId);
  if (!run || run.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [items, adjustments] = await Promise.all([
    listPayrollRunItems(runId),
    listPayrollAdjustments(runId),
  ]);

  return NextResponse.json({ run, items, adjustments });
}

