import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import {
  deleteInvoiceAttachment,
  getInvoiceAttachment,
} from "@/lib/data/invoice-attachments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string; attachmentId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId, attachmentId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await getInvoiceAttachment(attachmentId);
  if (!attachment || attachment.invoiceId !== invoiceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, invoice.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteInvoiceAttachment(attachmentId);

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.attachment.delete",
    entity: "sales_invoice",
    entityId: invoiceId,
    metadata: { attachmentId, name: attachment.name },
  });

  return NextResponse.json({ ok: true });
}
