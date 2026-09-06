import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesDebitNoteById } from "@/lib/data/debit-notes";
import { getCustomerById } from "@/lib/data/customers";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { recordAuditEvent } from "@/lib/data/audit-log";

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

  const membership = await requireCompanyRole(user.id, note.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const customer = await getCustomerById(note.customerId);
  if (!customer || !customer.email) {
    return NextResponse.json({ error: "Customer email missing" }, { status: 400 });
  }

  const subject = `Debit note ${note.debitNumber}`;
  const body = `<p>Your debit note ${note.debitNumber} is available.</p><p>Total: ${note.total} ${note.currency}</p>`;

  await queueEmailWithDispatch({
    companyId: note.companyId,
    to: customer.email,
    subject,
    body,
    sourceType: "debit_note",
    sourceId: note.id,
  });

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "debit_note.send",
    entity: "sales_debit_note",
    entityId: note.id,
    metadata: { debitNumber: note.debitNumber },
  });

  return NextResponse.json({ ok: true });
}
