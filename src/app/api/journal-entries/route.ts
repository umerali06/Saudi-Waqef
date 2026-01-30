import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { createJournalEntry, listJournalEntries } from "@/lib/data/journal-entries";
import { manualJournalEntrySchema } from "@/lib/validators/journal-entries";
import { getCompanyConfig } from "@/lib/data/company-config";
import { findClosedPeriod } from "@/lib/data/accounting-periods";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const isDateInRange = (date: string, startDate?: string | null, endDate?: string | null) => {
  if (startDate && date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const status = searchParams.get("status");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entries = await listJournalEntries(companyId);
  const filtered = entries
    .filter((entry) => ["manual", "manual_reversal"].includes(entry.sourceType))
    .filter((entry) =>
      status && status !== "all" ? entry.status === status : true
    )
    .filter((entry) => isDateInRange(entry.date, startDate, endDate))
    .sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ entries: filtered });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = manualJournalEntrySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "Unbalanced entry") {
      return NextResponse.json({ error: "Unbalanced entry" }, { status: 400 });
    }
    if (issue?.message === "Invalid line amount") {
      return NextResponse.json({ error: "Invalid line amount" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accounts = await listChartAccounts(parsed.data.companyId);
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  for (const line of parsed.data.lines) {
    const account = accountMap.get(line.accountId);
    if (!account || !account.isPosting || account.status !== "active") {
      return NextResponse.json({ error: "Invalid account" }, { status: 400 });
    }
  }

  const status = parsed.data.status ?? "draft";
  if (status === "posted") {
    const config = await getCompanyConfig(parsed.data.companyId);
    if (config.periodLockDate && parsed.data.date <= config.periodLockDate) {
      return NextResponse.json({ error: "Posting period is locked" }, { status: 403 });
    }
    const closedPeriod = await findClosedPeriod(
      parsed.data.companyId,
      parsed.data.date
    );
    if (closedPeriod && !parsed.data.isAdjusting) {
      return NextResponse.json({ error: "Accounting period is closed" }, { status: 403 });
    }
  }

  const entryId = await createJournalEntry({
    companyId: parsed.data.companyId,
    sourceType: "manual",
    date: parsed.data.date,
    memo: parsed.data.memo ?? null,
    lines: parsed.data.lines,
    status,
    createdBy: user.id,
    approvedBy: status === "posted" ? user.id : null,
    approvedAt: status === "posted" ? new Date() : null,
    isAdjusting: parsed.data.isAdjusting,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: status === "posted" ? "journal.post" : "journal.create",
    entity: "journal_entry",
    entityId: entryId,
    metadata: { status },
  });

  return NextResponse.json({ entryId });
}

