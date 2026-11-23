import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { hasRequiredRole, requireCompanyRole } from "@/lib/access";
import { claimPayrollRunStatus, getPayrollRun, updatePayrollRun } from "@/lib/data/payroll-runs";
import { getPayrollSettings } from "@/lib/data/payroll-settings";
import { getCompanyConfig } from "@/lib/data/company-config";
import { createJournalEntry, listJournalEntries } from "@/lib/data/journal-entries";
import { buildPayrollJournalLines, isBalancedJournal } from "@/lib/utils/payroll-run";
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

  const closed = await periodClosedResponse(companyId, run.periodEnd);
  if (closed) return closed;

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

  const lines = buildPayrollJournalLines({
    netPay: run.totals.netPay,
    totalDeductions: run.totals.totalDeductions,
    gosiEmployer: run.totals.gosiEmployer ?? 0,
    accounts: {
      salaryExpenseAccountId: settings.salaryExpenseAccountId,
      payrollPayableAccountId: settings.payrollPayableAccountId,
      salaryDeductionsAccountId: settings.salaryDeductionsAccountId,
      gosiExpenseAccountId: settings.gosiExpenseAccountId,
      gosiPayableAccountId: settings.gosiPayableAccountId,
    },
  });
  if (lines.length === 0 || !isBalancedJournal(lines)) {
    return NextResponse.json({ error: "Unbalanced payroll journal" }, { status: 400 });
  }

  const claimed = await claimPayrollRunStatus(runId, "draft", {
    status: "approved",
    approvedBy: user.id,
    approvedAt: new Date(),
  });
  if (!claimed) {
    return NextResponse.json({ error: "Payroll run locked" }, { status: 400 });
  }

  try {
    // Reuse an entry already posted for this run instead of posting it a second time.
    const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
    const posted = (await listJournalEntries(companyId)).find(
      (entry) =>
        entry.sourceType === "payroll_run" &&
        entry.sourceId === runId &&
        entry.status === "posted" &&
        !entry.reversedBy &&
        Math.abs(entry.totalDebit - totalDebit) < 0.01 &&
        Math.abs(entry.totalDebit - entry.totalCredit) < 0.01
    );
    const journalEntryId =
      posted?.id ??
      (await createJournalEntry({
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
      }));
    await updatePayrollRun(runId, { journalEntryId });
  } catch (error) {
    await updatePayrollRun(runId, { status: "draft", approvedBy: null, approvedAt: null });
    throw error;
  }

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
