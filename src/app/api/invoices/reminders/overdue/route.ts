import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { getCustomerById } from "@/lib/data/customers";
import { listContacts } from "@/lib/data/contacts";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RequestBody = {
  companyId?: string;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const companyId = body?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoices = await listSalesInvoices(companyId);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = invoices.filter(
    (inv) => inv.balance > 0 && inv.dueDate < today && inv.status !== "canceled"
  );

  if (!body?.dryRun) {
    for (const invoice of overdue) {
      const customer = await getCustomerById(invoice.customerId);
      let recipientEmail = customer?.email ?? null;
      if (!recipientEmail && customer) {
        const contacts = await listContacts({
          companyId,
          partyType: "customer",
          partyId: customer.id,
        });
        const primary = contacts.find((contact) => contact.isPrimary && contact.email);
        const fallback = contacts.find((contact) => contact.email);
        recipientEmail = primary?.email ?? fallback?.email ?? null;
      }
      if (recipientEmail) {
        const subject = `Invoice ${invoice.invoiceNumber} overdue`;
        const bodyHtml = `<p>Invoice ${invoice.invoiceNumber} is overdue.</p><p>Amount: ${invoice.balance} ${invoice.currency}</p>`;
        await queueEmailWithDispatch({
          companyId,
          to: recipientEmail,
          subject,
          body: bodyHtml,
          sourceType: "invoice_overdue",
          sourceId: invoice.id,
        });
      }
      await notifyCompanyRoles({
        companyId,
        roles: ["owner", "admin", "accountant"],
        type: "invoice_overdue",
        actorId: user.id,
        data: {
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate,
          amount: `${invoice.balance}`,
          currency: invoice.currency ?? "SAR",
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    count: overdue.length,
    invoices: overdue.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      dueDate: inv.dueDate,
      balance: inv.balance,
      currency: inv.currency ?? "SAR",
    })),
  });
}
