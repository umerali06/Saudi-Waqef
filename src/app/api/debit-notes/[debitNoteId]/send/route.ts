import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesDebitNoteById } from "@/lib/data/debit-notes";
import { getCustomerById } from "@/lib/data/customers";
import { getCompanyById } from "@/lib/data/companies";
import { renderDocumentEmail } from "@/lib/email/documents";
import { sendDocumentEmail } from "@/lib/email/queue";
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

  if (note.status !== "issued") {
    return NextResponse.json({ error: "Note must be issued" }, { status: 400 });
  }
  const company = await getCompanyById(note.companyId);
  const seller = {
    name: company?.legalName || company?.name || "",
    vatNumber: company?.vatNumber ?? null,
  };
  const locale = company?.defaultLanguage ?? "ar";
  const sent = await sendDocumentEmail({
    companyId: note.companyId,
    to: customer.email,
    subject:
      locale === "ar"
        ? `إشعار مدين رقم ${note.debitNumber} - ${seller.name}`
        : `Debit note ${note.debitNumber} - ${seller.name}`,
    body: renderDocumentEmail({
      kind: "debit",
      locale,
      number: note.debitNumber,
      issueDate: note.issueDate,
      total: note.total,
      currency: note.currency || "SAR",
      seller,
    }),
    sourceType: "debit_note",
    sourceId: note.id,
    meta: { fromName: seller.name, replyTo: user.email ?? null },
  });
  if (!sent.ok) {
    return NextResponse.json({ error: "EMAIL_FAILED" }, { status: 502 });
  }

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
