import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesCreditNoteById, updateSalesCreditNote } from "@/lib/data/credit-notes";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { createCreditNoteRefund } from "@/lib/data/credit-note-refunds";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  companyId: z.string().min(1),
  refundDate: z.string().min(10),
  amount: z.number().positive(),
  accountId: z.string().min(1),
  reference: z.string().optional().nullable(),
});

type RouteContext = {
  params: Promise<{ creditNoteId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creditNoteId } = await context.params;
  const note = await getSalesCreditNoteById(creditNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== note.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, note.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(note.companyId),
    listChartAccounts(note.companyId),
  ]);
  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(parsed.data.accountId)) {
    return NextResponse.json({ error: "Invalid payment account" }, { status: 400 });
  }

  const receivableId = defaults.receivableAccountId;
  if (!receivableId || !accountIds.has(receivableId)) {
    return NextResponse.json({ error: "Missing receivable account" }, { status: 400 });
  }

  const alreadyRefunded = note.refundedAmount ?? 0;
  if (parsed.data.amount > note.total - alreadyRefunded) {
    return NextResponse.json({ error: "Refund exceeds credit note" }, { status: 400 });
  }

  const journalEntryId = await createJournalEntry({
    companyId: note.companyId,
    sourceType: "credit_note_refund",
    sourceId: note.id,
    date: parsed.data.refundDate,
    memo: `Refund for ${note.creditNumber}`,
    lines: [
      {
        accountId: receivableId,
        debit: parsed.data.amount,
        credit: 0,
      },
      {
        accountId: parsed.data.accountId,
        debit: 0,
        credit: parsed.data.amount,
      },
    ],
  });

  const refundId = await createCreditNoteRefund({
    companyId: note.companyId,
    creditNoteId: note.id,
    refundDate: parsed.data.refundDate,
    amount: parsed.data.amount,
    accountId: parsed.data.accountId,
    reference: parsed.data.reference ?? null,
    journalEntryId,
  });

  await createCashTransaction({
    companyId: note.companyId,
    accountId: parsed.data.accountId,
    date: parsed.data.refundDate,
    amount: parsed.data.amount,
    direction: "out",
    reference: parsed.data.reference ?? note.creditNumber,
    description: `Credit refund ${note.creditNumber}`,
    sourceType: "credit_note_refund",
    sourceId: refundId,
  });

  await updateSalesCreditNote(note.id, {
    refundedAmount: alreadyRefunded + parsed.data.amount,
  });

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "credit_note.refund",
    entity: "sales_credit_note",
    entityId: note.id,
    metadata: { creditNumber: note.creditNumber, amount: parsed.data.amount },
  });

  return NextResponse.json({ ok: true, refundId });
}
