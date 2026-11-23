import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesCreditNoteById, updateSalesCreditNote } from "@/lib/data/credit-notes";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { createCreditNoteRefund, getCreditNoteRefund } from "@/lib/data/credit-note-refunds";
import { updateOpenItemBalance } from "@/lib/data/open-items";
import { PostingError, postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { assertSameRequest, loadSettlementAccount } from "@/lib/accounting/payments";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { roundMoney } from "@/lib/utils/invoice";
import { exceedsBalance } from "@/lib/utils/settlement";

export const runtime = "nodejs";

const schema = z.object({
  companyId: z.string().min(1),
  refundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  accountId: z.string().min(1),
  reference: z.string().optional().nullable(),
  requestId: z.string().uuid().optional(),
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

  const closedPeriod = await periodClosedResponse(note.companyId, parsed.data.refundDate);
  if (closedPeriod) {
    return closedPeriod;
  }

  const amount = roundMoney(parsed.data.amount);
  const refundId = parsed.data.requestId ?? uuidv4();
  try {
    const receivableId = await loadSettlementAccount(
      note.companyId,
      "receivable",
      parsed.data.accountId
    );
    const duplicate = await db.runTransaction(async (tx) => {
      const existing = await getCreditNoteRefund(refundId, tx);
      if (existing) {
        assertSameRequest(existing, { companyId: note.companyId, amount });
        return true;
      }
      const current = await getSalesCreditNoteById(note.id, tx);
      if (!current || current.status !== "issued") {
        throw new PostingError("Credit note is not issued");
      }
      if (exceedsBalance(amount, current.unappliedAmount)) {
        throw new PostingError("Refund exceeds credit note");
      }
      const journalEntryId = await createJournalEntry(
        {
          companyId: current.companyId,
          sourceType: "credit_note_refund",
          sourceId: current.id,
          date: parsed.data.refundDate,
          memo: `Refund for ${current.creditNumber}`,
          lines: [
            { accountId: receivableId, debit: amount, credit: 0 },
            { accountId: parsed.data.accountId, debit: 0, credit: amount },
          ],
        },
        tx
      );
      await createCreditNoteRefund(
        {
          id: refundId,
          companyId: current.companyId,
          creditNoteId: current.id,
          refundDate: parsed.data.refundDate,
          amount,
          accountId: parsed.data.accountId,
          reference: parsed.data.reference ?? null,
          journalEntryId,
        },
        tx
      );
      await createCashTransaction(
        {
          companyId: current.companyId,
          accountId: parsed.data.accountId,
          date: parsed.data.refundDate,
          amount,
          direction: "out",
          reference: parsed.data.reference ?? current.creditNumber,
          description: `Credit refund ${current.creditNumber}`,
          sourceType: "credit_note_refund",
          sourceId: refundId,
        },
        tx
      );
      const remaining = roundMoney(current.unappliedAmount - amount);
      await updateSalesCreditNote(
        current.id,
        {
          refundedAmount: roundMoney((current.refundedAmount ?? 0) + amount),
          unappliedAmount: remaining,
        },
        tx
      );
      if (current.creditOpenItemId) {
        await updateOpenItemBalance(
          current.creditOpenItemId,
          remaining === 0 ? 0 : -remaining,
          tx
        );
      }
      return false;
    });
    if (duplicate) {
      return NextResponse.json({ ok: true, refundId });
    }
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "credit_note.refund",
    entity: "sales_credit_note",
    entityId: note.id,
    metadata: { creditNumber: note.creditNumber, amount },
  });

  return NextResponse.json({ ok: true, refundId });
}
