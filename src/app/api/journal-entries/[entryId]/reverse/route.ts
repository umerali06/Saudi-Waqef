import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getCompanyConfig } from "@/lib/data/company-config";
import { findClosedPeriod } from "@/lib/data/accounting-periods";
import { createJournalEntry, getJournalEntry, updateJournalEntry } from "@/lib/data/journal-entries";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entryId } = await context.params;
  const entry = await getJournalEntry(entryId);
  if (!entry || entry.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (entry.sourceType !== "manual" || entry.status !== "posted") {
    return NextResponse.json({ error: "Entry cannot be reversed" }, { status: 400 });
  }

  const reversalDate = new Date().toISOString().slice(0, 10);
  const config = await getCompanyConfig(companyId);
  if (config.periodLockDate && reversalDate <= config.periodLockDate) {
    return NextResponse.json({ error: "Posting period is locked" }, { status: 403 });
  }
  const closedPeriod = await findClosedPeriod(companyId, reversalDate);
  if (closedPeriod) {
    return NextResponse.json({ error: "Accounting period is closed" }, { status: 403 });
  }

  const reversedLines = entry.lines.map((line) => ({
    accountId: line.accountId,
    debit: line.credit,
    credit: line.debit,
  }));

  const reversalId = await createJournalEntry({
    companyId,
    sourceType: "manual_reversal",
    sourceId: entryId,
    date: reversalDate,
    memo: `Reversal of ${entryId}`,
    lines: reversedLines,
    status: "posted",
    createdBy: user.id,
    approvedBy: user.id,
    approvedAt: new Date(),
    reversalOf: entryId,
  });

  await updateJournalEntry(entryId, {
    reversedBy: user.id,
    reversedAt: new Date(),
  });

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "journal.reverse",
    entity: "journal_entry",
    entityId: reversalId,
    metadata: { reversalOf: entryId },
  });

  return NextResponse.json({ entryId: reversalId });
}
