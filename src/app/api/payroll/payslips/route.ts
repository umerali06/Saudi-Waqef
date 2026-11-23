import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership } from "@/lib/access";
import { getEmployeeByUserId } from "@/lib/data/employees";
import { listPayrollRunItemsByEmployee } from "@/lib/data/payroll-run-items";
import { listPayrollRuns } from "@/lib/data/payroll-runs";

export const runtime = "nodejs";

/** The signed-in employee's own payslips. */
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

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employee = await getEmployeeByUserId(companyId, user.id);
  if (!employee) {
    return NextResponse.json({ payslips: [] });
  }

  const [items, runs] = await Promise.all([
    listPayrollRunItemsByEmployee(employee.id),
    listPayrollRuns(companyId),
  ]);
  const payslips = runs
    .filter((run) => run.status !== "draft")
    .flatMap((run) =>
      items
        .filter((item) => item.runId === run.id && item.companyId === companyId)
        .map((item) => ({
          id: item.id,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
          status: run.status,
          netPay: item.netPay,
          currency: item.currency,
        }))
    );

  return NextResponse.json({ payslips });
}
