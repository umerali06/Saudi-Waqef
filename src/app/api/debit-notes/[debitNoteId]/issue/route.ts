import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { issueSalesDebitNote } from "@/lib/accounting/sales";
import { getSalesDebitNoteById } from "@/lib/data/debit-notes";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ debitNoteId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { debitNoteId } = await context.params;
  const note = await getSalesDebitNoteById(debitNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (note.status !== "draft") {
    return NextResponse.json({ error: "Debit note is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, note.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(note.companyId, note.issueDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const closedPeriod = await periodClosedResponse(note.companyId, note.issueDate);
  if (closedPeriod) {
    return closedPeriod;
  }

  let issued: Awaited<ReturnType<typeof issueSalesDebitNote>>;
  try {
    issued = await issueSalesDebitNote({
      noteId: note.id,
      issueDate: note.issueDate,
      companyId: note.companyId,
    });
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "debit-note.issue",
    entity: "sales_debit_note",
    entityId: note.id,
    metadata: { debitNumber: note.debitNumber },
  });

  return NextResponse.json({ ok: true, journalEntryId: issued.journalEntryId });
}
