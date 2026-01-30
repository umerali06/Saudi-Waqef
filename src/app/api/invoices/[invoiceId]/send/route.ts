import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

const sendSchema = z.object({
  companyId: z.string().min(1),
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1),
});

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice || invoice.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status === "draft") {
    return NextResponse.json({ error: "Invoice must be approved" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await queueEmailWithDispatch({
    companyId: invoice.companyId,
    to: parsed.data.to,
    subject: parsed.data.subject,
    body: parsed.data.message,
    sourceType: "sales_invoice",
    sourceId: invoice.id,
    meta: {
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.total,
    },
  });

  await updateSalesInvoice(invoiceId, {
    status: "sent",
    sentAt: new Date().toISOString(),
    sentTo: parsed.data.to,
  });

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.send",
    entity: "sales_invoice",
    entityId: invoice.id,
    metadata: { to: parsed.data.to },
  });

  await notifyCompanyRoles({
    companyId: invoice.companyId,
    roles: ["owner", "admin", "accountant"],
    type: "invoice_sent",
    actorId: user.id,
    data: {
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      amount: `${invoice.total}`,
      currency: invoice.currency ?? "SAR",
    },
  });

  return NextResponse.json({ ok: true });
}
