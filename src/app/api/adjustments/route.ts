import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { adjustmentSchema } from "@/lib/validators/payments";
import { createCashAdjustment, listCashAdjustments } from "@/lib/data/cash-adjustments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";

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

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accountId = searchParams.get("accountId");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = normalizeSearch(searchParams.get("q") ?? "");

  const adjustments = await listCashAdjustments(companyId);
  let filtered = adjustments;
  if (accountId) {
    filtered = filtered.filter((entry) => entry.accountId === accountId);
  }
  if (type) {
    filtered = filtered.filter((entry) => entry.type === type);
  }
  if (from) {
    filtered = filtered.filter((entry) => entry.adjustmentDate >= from);
  }
  if (to) {
    filtered = filtered.filter((entry) => entry.adjustmentDate <= to);
  }
  if (q) {
    filtered = filtered.filter((entry) =>
      normalizeSearch(entry.adjustmentNumber).includes(q)
    );
  }

  filtered.sort((a, b) => b.adjustmentDate.localeCompare(a.adjustmentDate));

  return NextResponse.json({
    adjustments: filtered.map((entry) => ({
      id: entry.id,
      adjustmentNumber: entry.adjustmentNumber,
      adjustmentDate: entry.adjustmentDate,
      accountId: entry.accountId,
      offsetAccountId: entry.offsetAccountId,
      type: entry.type,
      amount: entry.amount,
      reason: entry.reason ?? null,
      memo: entry.memo ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adjustmentSchema.safeParse(body);
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

  const accounts = await listChartAccounts(parsed.data.companyId);
  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(parsed.data.accountId)) {
    return NextResponse.json({ error: "Invalid account" }, { status: 400 });
  }
  if (!accountIds.has(parsed.data.offsetAccountId)) {
    return NextResponse.json({ error: "Invalid offset account" }, { status: 400 });
  }

  const lines =
    parsed.data.type === "increase"
      ? [
          {
            accountId: parsed.data.accountId,
            debit: parsed.data.amount,
            credit: 0,
          },
          {
            accountId: parsed.data.offsetAccountId,
            debit: 0,
            credit: parsed.data.amount,
          },
        ]
      : [
          {
            accountId: parsed.data.offsetAccountId,
            debit: parsed.data.amount,
            credit: 0,
          },
          {
            accountId: parsed.data.accountId,
            debit: 0,
            credit: parsed.data.amount,
          },
        ];

  const journalEntryId = await createJournalEntry({
    companyId: parsed.data.companyId,
    sourceType: "cash_adjustment",
    sourceId: null,
    date: parsed.data.adjustmentDate,
    memo: parsed.data.memo ?? parsed.data.reason ?? "Cash adjustment",
    lines,
  });

  const { id, adjustmentNumber } = await createCashAdjustment({
    companyId: parsed.data.companyId,
    adjustmentDate: parsed.data.adjustmentDate,
    accountId: parsed.data.accountId,
    offsetAccountId: parsed.data.offsetAccountId,
    type: parsed.data.type,
    amount: parsed.data.amount,
    reason: parsed.data.reason ?? null,
    memo: parsed.data.memo ?? null,
    journalEntryId,
  });

  await createCashTransaction({
    companyId: parsed.data.companyId,
    accountId: parsed.data.accountId,
    date: parsed.data.adjustmentDate,
    amount: parsed.data.amount,
    direction: parsed.data.type === "increase" ? "in" : "out",
    reference: adjustmentNumber,
    description: `Adjustment ${adjustmentNumber}`,
    sourceType: "cash_adjustment",
    sourceId: id,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "adjustment.create",
    entity: "cash_adjustment",
    entityId: id,
    metadata: { adjustmentNumber, amount: parsed.data.amount },
  });

  return NextResponse.json({ adjustmentId: id, adjustmentNumber });
}

