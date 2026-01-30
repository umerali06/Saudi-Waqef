import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { transferSchema } from "@/lib/validators/payments";
import { createBankTransfer, listBankTransfers } from "@/lib/data/bank-transfers";
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

  const fromAccountId = searchParams.get("fromAccountId");
  const toAccountId = searchParams.get("toAccountId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = normalizeSearch(searchParams.get("q") ?? "");

  const transfers = await listBankTransfers(companyId);
  let filtered = transfers;
  if (fromAccountId) {
    filtered = filtered.filter((transfer) => transfer.fromAccountId === fromAccountId);
  }
  if (toAccountId) {
    filtered = filtered.filter((transfer) => transfer.toAccountId === toAccountId);
  }
  if (from) {
    filtered = filtered.filter((transfer) => transfer.transferDate >= from);
  }
  if (to) {
    filtered = filtered.filter((transfer) => transfer.transferDate <= to);
  }
  if (q) {
    filtered = filtered.filter((transfer) =>
      normalizeSearch(transfer.transferNumber).includes(q)
    );
  }

  filtered.sort((a, b) => b.transferDate.localeCompare(a.transferDate));

  return NextResponse.json({
    transfers: filtered.map((transfer) => ({
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      transferDate: transfer.transferDate,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: transfer.amount,
      reference: transfer.reference ?? null,
      memo: transfer.memo ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.fromAccountId === parsed.data.toAccountId) {
    return NextResponse.json({ error: "Accounts must differ" }, { status: 400 });
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
  if (!accountIds.has(parsed.data.fromAccountId)) {
    return NextResponse.json({ error: "Invalid source account" }, { status: 400 });
  }
  if (!accountIds.has(parsed.data.toAccountId)) {
    return NextResponse.json({ error: "Invalid destination account" }, { status: 400 });
  }

  const journalEntryId = await createJournalEntry({
    companyId: parsed.data.companyId,
    sourceType: "bank_transfer",
    sourceId: null,
    date: parsed.data.transferDate,
    memo: parsed.data.memo ?? "Internal transfer",
    lines: [
      {
        accountId: parsed.data.toAccountId,
        debit: parsed.data.amount,
        credit: 0,
      },
      {
        accountId: parsed.data.fromAccountId,
        debit: 0,
        credit: parsed.data.amount,
      },
    ],
  });

  const { id, transferNumber } = await createBankTransfer({
    companyId: parsed.data.companyId,
    transferDate: parsed.data.transferDate,
    fromAccountId: parsed.data.fromAccountId,
    toAccountId: parsed.data.toAccountId,
    amount: parsed.data.amount,
    reference: parsed.data.reference ?? null,
    memo: parsed.data.memo ?? null,
    journalEntryId,
  });

  await createCashTransaction({
    companyId: parsed.data.companyId,
    accountId: parsed.data.fromAccountId,
    date: parsed.data.transferDate,
    amount: parsed.data.amount,
    direction: "out",
    reference: parsed.data.reference ?? transferNumber,
    description: `Transfer ${transferNumber}`,
    sourceType: "bank_transfer",
    sourceId: id,
  });

  await createCashTransaction({
    companyId: parsed.data.companyId,
    accountId: parsed.data.toAccountId,
    date: parsed.data.transferDate,
    amount: parsed.data.amount,
    direction: "in",
    reference: parsed.data.reference ?? transferNumber,
    description: `Transfer ${transferNumber}`,
    sourceType: "bank_transfer",
    sourceId: id,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "transfer.create",
    entity: "bank_transfer",
    entityId: id,
    metadata: { transferNumber, amount: parsed.data.amount },
  });

  return NextResponse.json({ transferId: id, transferNumber });
}

