import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { listSalesInvoices, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { getCustomerById } from "@/lib/data/customers";
import { listContacts } from "@/lib/data/contacts";
import { getCompanyById } from "@/lib/data/companies";
import { renderDocumentEmail } from "@/lib/email/documents";
import { sendDocumentEmail } from "@/lib/email/queue";
import { translator } from "@/lib/pdf/report";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    (inv) =>
      inv.balance > 0 &&
      inv.dueDate < today &&
      !["draft", "canceled"].includes(inv.status)
  );

  // One reminder per invoice per day, however often the button is pressed.
  const due = overdue.filter((inv) => inv.lastReminderAt?.slice(0, 10) !== today);
  let sentCount = 0;
  let failed = 0;
  if (!body?.dryRun) {
    const company = await getCompanyById(companyId);
    const locale = company?.defaultLanguage ?? "ar";
    const t = translator(locale);
    const seller = {
      name: company?.legalName || company?.name || "",
      vatNumber: company?.vatNumber ?? null,
    };
    for (const invoice of due) {
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
        const sent = await sendDocumentEmail({
          companyId,
          to: recipientEmail,
          subject: `${t("invoice.overdueSubject")} ${invoice.invoiceNumber} - ${seller.name}`,
          body: renderDocumentEmail({
            kind: "invoice",
            locale,
            message: t("invoice.overdueMessage"),
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
            reminder: true,
            invoiceNumber: invoice.invoiceNumber,
            fromName: seller.name,
            replyTo: user.email ?? null,
          },
        });
        if (!sent.ok) {
          // Left unmarked, so the next run tries again.
          failed += 1;
          continue;
        }
        sentCount += 1;
      }
      await updateSalesInvoice(invoice.id, { lastReminderAt: new Date().toISOString() });
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
    sent: sentCount,
    failed,
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
