import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyRole } from "@/lib/access";
import { getPayrollRun, updatePayrollRun } from "@/lib/data/payroll-runs";
import { getPayrollSettings } from "@/lib/data/payroll-settings";
import { getCompanyConfig } from "@/lib/data/company-config";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const companyId = body?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { runId } = await context.params;
  const run = await getPayrollRun(runId);
  if (!run || run.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (run.status !== "draft") {
    return NextResponse.json({ error: "Payroll run locked" }, { status: 400 });
  }

  const config = await getCompanyConfig(companyId);
  const threshold = typeof config.payrollApprovalThreshold === "number"
    ? config.payrollApprovalThreshold
    : 0;
  if (threshold > 0 && run.totals.netPay >= threshold) {
    const allowed = hasRequiredRole(membership.role, ["owner", "admin"]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Approval requires owner or admin" },
        { status: 403 }
      );
    }
  }

  const settings = await getPayrollSettings(companyId);
  if (!settings.salaryExpenseAccountId || !settings.payrollPayableAccountId) {
    return NextResponse.json({ error: "Missing payroll accounts" }, { status: 400 });
  }
  if (run.totals.totalDeductions > 0 && !settings.salaryDeductionsAccountId) {
    return NextResponse.json({ error: "Missing deduction account" }, { status: 400 });
  }

  const lines = [
    {
      accountId: settings.salaryExpenseAccountId,
      debit: run.totals.grossPay,
      credit: 0,
    },
    {
      accountId: settings.payrollPayableAccountId,
      debit: 0,
      credit: run.totals.netPay,
    },
  ];
  if (run.totals.totalDeductions > 0 && settings.salaryDeductionsAccountId) {
    lines.push({
      accountId: settings.salaryDeductionsAccountId,
      debit: 0,
      credit: run.totals.totalDeductions,
    });
  }

  const journalEntryId = await createJournalEntry({
    companyId,
    sourceType: "payroll_run",
    sourceId: runId,
    date: run.periodEnd,
    memo: `Payroll run ${run.periodStart} - ${run.periodEnd}`,
    lines,
    status: "posted",
    createdBy: user.id,
    approvedBy: user.id,
    approvedAt: new Date(),
  });

  await updatePayrollRun(runId, {
    status: "approved",
    approvedBy: user.id,
    approvedAt: new Date(),
    journalEntryId,
  });

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "payroll.run.approve",
    entity: "payroll_run",
    entityId: runId,
  });

  await notifyCompanyRoles({
    companyId,
    roles: ["owner", "admin", "hr"],
    type: "payroll_approved",
    actorId: user.id,
    data: {
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
    },
  });

  return NextResponse.json({ ok: true });
}
