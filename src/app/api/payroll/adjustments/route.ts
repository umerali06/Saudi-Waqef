import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { payrollAdjustmentSchema } from "@/lib/validators/payroll";
import { createPayrollAdjustment, listPayrollAdjustments } from "@/lib/data/payroll-adjustments";
import { getPayrollRun, updatePayrollRun } from "@/lib/data/payroll-runs";
import { getPayrollRunItem, listPayrollRunItems, updatePayrollRunItem } from "@/lib/data/payroll-run-items";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const runId = searchParams.get("runId");

  if (!companyId || !runId) {
    return NextResponse.json({ error: "companyId and runId are required" }, { status: 400 });
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adjustments = await listPayrollAdjustments(runId);
  return NextResponse.json({ adjustments });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payrollAdjustmentSchema.safeParse(body);
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

  const run = await getPayrollRun(parsed.data.runId);
  if (!run || run.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (run.status !== "draft") {
    return NextResponse.json({ error: "Payroll run locked" }, { status: 400 });
  }

  const item = await getPayrollRunItem(parsed.data.runItemId);
  if (!item || item.companyId !== parsed.data.companyId || item.runId !== run.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const adjustmentId = await createPayrollAdjustment({
    ...parsed.data,
    createdBy: user.id,
  });

  const adjustmentsTotal = (item.adjustmentsTotal ?? 0) + parsed.data.amount;
  const netPay = item.grossPay - item.totalDeductions + adjustmentsTotal;

  await updatePayrollRunItem(item.id, { adjustmentsTotal, netPay });

  const items = await listPayrollRunItems(run.id);
  const totals = items.reduce(
    (acc, entry) => {
      acc.grossPay += entry.grossPay;
      acc.totalDeductions += entry.totalDeductions;
      acc.netPay += entry.netPay;
      acc.employeeCount += 1;
      return acc;
    },
    { grossPay: 0, totalDeductions: 0, netPay: 0, employeeCount: 0 }
  );
  await updatePayrollRun(run.id, { totals });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "payroll.adjustment.create",
    entity: "payroll_adjustment",
    entityId: adjustmentId,
    metadata: { runId: parsed.data.runId, runItemId: parsed.data.runItemId },
  });

  return NextResponse.json({ adjustmentId });
}

