import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  listOpeningBalances,
  openingEntryId,
  saveOpeningBalances,
} from "@/lib/data/opening-balances";
import { openingBalanceSchema } from "@/lib/validators/company";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { getJournalEntry } from "@/lib/data/journal-entries";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { periodClosedResponse } from "@/lib/accounting/period-guard";

export const runtime = "nodejs";

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

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [balances, entry] = await Promise.all([
    listOpeningBalances(companyId),
    getJournalEntry(openingEntryId(companyId)),
  ]);
  return NextResponse.json({ balances, posted: Boolean(entry) });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = openingBalanceSchema.safeParse(body);
  if (!parsed.success) {
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

  const asOfDate =
    parsed.data.asOfDate ??
    new Date().toISOString().slice(0, 10);
  const accounts = await listChartAccounts(parsed.data.companyId);
  const accountIds = new Set(accounts.map((account) => account.id));
  if (parsed.data.entries.some((entry) => !accountIds.has(entry.accountId))) {
    return NextResponse.json({ error: "Invalid account" }, { status: 400 });
  }

  const posted = await getJournalEntry(openingEntryId(parsed.data.companyId));
  const closedPeriod =
    (await periodClosedResponse(parsed.data.companyId, asOfDate)) ??
    (posted ? await periodClosedResponse(parsed.data.companyId, posted.date) : null);
  if (closedPeriod) {
    return closedPeriod;
  }

  const totalDebit = parsed.data.entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = parsed.data.entries.reduce((sum, entry) => sum + entry.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    return NextResponse.json({ error: "Balances must match" }, { status: 400 });
  }

  await saveOpeningBalances(
    parsed.data.companyId,
    parsed.data.entries,
    asOfDate,
    user.id
  );
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "opening_balances.update",
    entity: "opening_balance",
    metadata: { entries: parsed.data.entries.length, asOfDate },
  });
  return NextResponse.json({ ok: true });
}
