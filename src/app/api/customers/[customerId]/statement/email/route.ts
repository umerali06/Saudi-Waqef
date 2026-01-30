import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getCustomerById } from "@/lib/data/customers";
import { listContacts } from "@/lib/data/contacts";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await context.params;
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, customer.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let recipientEmail = customer.email ?? null;
  if (!recipientEmail) {
    const contacts = await listContacts({
      companyId: customer.companyId,
      partyType: "customer",
      partyId: customerId,
    });
    const primary = contacts.find((contact) => contact.isPrimary && contact.email);
    const fallback = contacts.find((contact) => contact.email);
    recipientEmail = primary?.email ?? fallback?.email ?? null;
  }

  if (!recipientEmail) {
    return NextResponse.json({ error: "Customer email missing" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const locale = body?.locale === "en" ? "en" : "ar";
  const subject =
    locale === "ar"
      ? `كشف حساب ${customer.name}`
      : `Statement for ${customer.name}`;
  const link = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/sales/customers/${customerId}`;
  const html =
    locale === "ar"
      ? `<p>تم إعداد كشف الحساب للعميل ${customer.name}.</p><p><a href="${link}">عرض داخل النظام</a></p>`
      : `<p>Your statement for ${customer.name} is ready.</p><p><a href="${link}">View in the system</a></p>`;

  await queueEmailWithDispatch({
    companyId: customer.companyId,
    to: recipientEmail,
    subject,
    body: html,
    sourceType: "customer_statement",
    sourceId: customerId,
    meta: { locale, customerName: customer.name, recipientEmail },
  });

  await notifyCompanyRoles({
    companyId: customer.companyId,
    roles: ["owner", "admin", "accountant"],
    type: "customer_statement_sent",
    actorId: user.id,
    data: {
      customerName: customer.name,
    },
  });

  await recordAuditEvent({
    companyId: customer.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "customer.statement_sent",
    entity: "customer",
    entityId: customerId,
    metadata: { recipientEmail },
  });

  return NextResponse.json({ ok: true });
}
