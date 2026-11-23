import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { getCompanyById } from "@/lib/data/companies";
import { renderDocumentEmail } from "@/lib/email/documents";
import { sendDocumentEmail } from "@/lib/email/queue";
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
  locale: z.enum(["ar", "en"]).optional(),
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
  if (invoice.status === "canceled") {
    return NextResponse.json({ error: "Invoice is canceled" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await getCompanyById(invoice.companyId);
  const seller = {
    name: company?.legalName || company?.name || "",
    vatNumber: company?.vatNumber ?? null,
  };
  const sent = await sendDocumentEmail({
    companyId: invoice.companyId,
    to: parsed.data.to,
    subject: parsed.data.subject,
    body: renderDocumentEmail({
      kind: "invoice",
      locale: parsed.data.locale ?? company?.defaultLanguage ?? "ar",
      message: parsed.data.message,
      number: invoice.invoiceNumber,
      issueDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      balance: invoice.balance,
      currency: invoice.currency || "SAR",
      seller,
    }),
    sourceType: "sales_invoice",
    sourceId: invoice.id,
    meta: {
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.total,
      fromName: seller.name,
      replyTo: user.email ?? null,
    },
  });
  if (!sent.ok) {
    // Not marked as sent: the customer received nothing.
    return NextResponse.json({ error: "EMAIL_FAILED" }, { status: 502 });
  }

  await db.runTransaction(async (tx) => {
    const current = await getSalesInvoiceById(invoiceId, tx);
    await updateSalesInvoice(
      invoiceId,
      {
        ...(current?.status === "approved" ? { status: "sent" as const } : {}),
        sentAt: new Date().toISOString(),
        sentTo: parsed.data.to,
      },
      tx
    );
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
