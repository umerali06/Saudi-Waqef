import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { transferSchema } from "@/lib/validators/payments";
import {
  createBankTransfer,
  getBankTransferById,
  listBankTransfers,
} from "@/lib/data/bank-transfers";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { assertSameRequest } from "@/lib/accounting/payments";
import { roundMoney } from "@/lib/utils/invoice";

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

  const closedPeriod = await periodClosedResponse(
    parsed.data.companyId,
    parsed.data.transferDate
  );
  if (closedPeriod) {
    return closedPeriod;
  }

  const amount = roundMoney(parsed.data.amount);
  const id = parsed.data.requestId ?? uuidv4();
  let transferNumber: string;
  try {
    const result = await db.runTransaction(async (tx) => {
      const existing = await getBankTransferById(id, tx);
      if (existing) {
        assertSameRequest(existing, { companyId: parsed.data.companyId, amount });
        return { transferNumber: existing.transferNumber, duplicate: true };
      }
      const journalEntryId = uuidv4();
      const created = await createBankTransfer(
        {
          id,
          companyId: parsed.data.companyId,
          transferDate: parsed.data.transferDate,
          fromAccountId: parsed.data.fromAccountId,
          toAccountId: parsed.data.toAccountId,
          amount,
          reference: parsed.data.reference ?? null,
          memo: parsed.data.memo ?? null,
          journalEntryId,
        },
        tx
      );
      await createJournalEntry(
        {
          id: journalEntryId,
          companyId: parsed.data.companyId,
          sourceType: "bank_transfer",
          sourceId: id,
          date: parsed.data.transferDate,
          memo: parsed.data.memo ?? "Internal transfer",
          lines: [
            { accountId: parsed.data.toAccountId, debit: amount, credit: 0 },
            { accountId: parsed.data.fromAccountId, debit: 0, credit: amount },
          ],
        },
        tx
      );
      const movement = {
        companyId: parsed.data.companyId,
        date: parsed.data.transferDate,
        amount,
        reference: parsed.data.reference ?? created.transferNumber,
        description: `Transfer ${created.transferNumber}`,
        sourceType: "bank_transfer",
        sourceId: id,
      };
      await createCashTransaction(
        { ...movement, accountId: parsed.data.fromAccountId, direction: "out" },
        tx
      );
      await createCashTransaction(
        { ...movement, accountId: parsed.data.toAccountId, direction: "in" },
        tx
      );
      return { transferNumber: created.transferNumber, duplicate: false };
    });
    transferNumber = result.transferNumber;
    if (result.duplicate) {
      return NextResponse.json({ transferId: id, transferNumber });
    }
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "transfer.create",
    entity: "bank_transfer",
    entityId: id,
    metadata: { transferNumber, amount },
  });

  return NextResponse.json({ transferId: id, transferNumber });
}

