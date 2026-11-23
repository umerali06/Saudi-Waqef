import { NextResponse } from "next/server";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { claimPayrollRunStatus, getPayrollRun, updatePayrollRun } from "@/lib/data/payroll-runs";
import { getPayrollSettings } from "@/lib/data/payroll-settings";
import { createJournalEntry, listJournalEntries } from "@/lib/data/journal-entries";
import { getChartAccount } from "@/lib/data/chart-accounts";
import { payrollRunPaySchema } from "@/lib/validators/payroll";
import { recordAuditEvent } from "@/lib/data/audit-log";

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
  const parsed = payrollRunPaySchema.safeParse(body);
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

  const { runId } = await context.params;
  const run = await getPayrollRun(runId);
  if (!run || run.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (run.status !== "approved") {
    return NextResponse.json({ error: "Payroll run locked" }, { status: 400 });
  }

  const settings = await getPayrollSettings(parsed.data.companyId);
  const paymentAccountId =
    parsed.data.paymentAccountId ?? settings.paymentAccountId ?? null;
  if (!paymentAccountId) {
    return NextResponse.json({ error: "Missing payment account" }, { status: 400 });
  }
  if (!settings.payrollPayableAccountId) {
    return NextResponse.json({ error: "Missing payroll accounts" }, { status: 400 });
  }

  const paymentDate = parsed.data.paymentDate ?? run.periodEnd;
  const closed = await periodClosedResponse(parsed.data.companyId, paymentDate);
  if (closed) return closed;

  const account = await getChartAccount(paymentAccountId);
  if (!account || account.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Missing payment account" }, { status: 400 });
  }

  const claimed = await claimPayrollRunStatus(runId, "approved", {
    status: "paid",
    paidAt: new Date(),
    paymentMethod: parsed.data.paymentMethod ?? null,
    paymentAccountId,
  });
  if (!claimed) {
    return NextResponse.json({ error: "Payroll run locked" }, { status: 400 });
  }

  try {
    const posted = (await listJournalEntries(parsed.data.companyId)).find(
      (entry) =>
        entry.sourceType === "payroll_payment" &&
        entry.sourceId === runId &&
        entry.status === "posted" &&
        !entry.reversedBy &&
        Math.abs(entry.totalDebit - run.totals.netPay) < 0.01
    );
    const paymentJournalEntryId =
      posted?.id ??
      (run.totals.netPay > 0
        ? await createJournalEntry({
            companyId: parsed.data.companyId,
            sourceType: "payroll_payment",
            sourceId: runId,
            date: paymentDate,
            memo: `Payroll payment ${run.periodStart} - ${run.periodEnd}`,
            lines: [
              {
                accountId: settings.payrollPayableAccountId,
                debit: run.totals.netPay,
                credit: 0,
              },
              {
                accountId: paymentAccountId,
                debit: 0,
                credit: run.totals.netPay,
              },
            ],
            status: "posted",
            createdBy: user.id,
            approvedBy: user.id,
            approvedAt: new Date(),
          })
        : null);
    await updatePayrollRun(runId, { paymentJournalEntryId });
  } catch (error) {
    await updatePayrollRun(runId, { status: "approved", paidAt: null });
    throw error;
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "payroll.run.pay",
    entity: "payroll_run",
    entityId: runId,
  });

  return NextResponse.json({ ok: true });
}
