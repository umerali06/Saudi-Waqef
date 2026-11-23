import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesCreditNoteById } from "@/lib/data/credit-notes";
import { getCustomerById } from "@/lib/data/customers";
import { getCompanyById } from "@/lib/data/companies";
import { renderDocumentEmail } from "@/lib/email/documents";
import { sendDocumentEmail } from "@/lib/email/queue";
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
        ? `إشعار دائن رقم ${note.creditNumber} - ${seller.name}`
        : `Credit note ${note.creditNumber} - ${seller.name}`,
    body: renderDocumentEmail({
      kind: "credit",
      locale,
      number: note.creditNumber,
      issueDate: note.issueDate,
      total: note.total,
      currency: note.currency || "SAR",
      seller,
    }),
    sourceType: "credit_note",
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
    action: "credit_note.send",
    entity: "sales_credit_note",
    entityId: note.id,
    metadata: { creditNumber: note.creditNumber },
  });

  return NextResponse.json({ ok: true });
}
