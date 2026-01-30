import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesCreditNoteById } from "@/lib/data/credit-notes";
import { getCustomerById } from "@/lib/data/customers";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ creditNoteId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creditNoteId } = await context.params;
  const note = await getSalesCreditNoteById(creditNoteId);
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

  const subject = `Credit note ${note.creditNumber}`;
  const body = `<p>Your credit note ${note.creditNumber} is available.</p><p>Total: ${note.total} ${note.currency}</p>`;

  await queueEmailWithDispatch({
    companyId: note.companyId,
    to: customer.email,
    subject,
    body,
    sourceType: "credit_note",
    sourceId: note.id,
  });

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "credit_note.send",
    entity: "sales_credit_note",
    entityId: note.id,
    metadata: { creditNumber: note.creditNumber },
  });

  return NextResponse.json({ ok: true });
}
