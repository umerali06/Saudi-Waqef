import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getVendorById } from "@/lib/data/vendors";
import { listContacts } from "@/lib/data/contacts";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ vendorId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vendorId } = await context.params;
  const vendor = await getVendorById(vendorId);
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, vendor.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let recipientEmail = vendor.email ?? null;
  if (!recipientEmail) {
    const contacts = await listContacts({
      companyId: vendor.companyId,
      partyType: "vendor",
      partyId: vendorId,
    });
    const primary = contacts.find((contact) => contact.isPrimary && contact.email);
    const fallback = contacts.find((contact) => contact.email);
    recipientEmail = primary?.email ?? fallback?.email ?? null;
  }

  if (!recipientEmail) {
    return NextResponse.json({ error: "Vendor email missing" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const locale = body?.locale === "en" ? "en" : "ar";
  const subject =
    locale === "ar"
      ? `كشف حساب المورد ${vendor.name}`
      : `Statement for ${vendor.name}`;
  const link = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/purchases/vendors/${vendorId}`;
  const html =
    locale === "ar"
      ? `<p>تم إعداد كشف حساب المورد ${vendor.name}.</p><p><a href="${link}">عرض داخل النظام</a></p>`
      : `<p>Your statement for ${vendor.name} is ready.</p><p><a href="${link}">View in the system</a></p>`;

  await queueEmailWithDispatch({
    companyId: vendor.companyId,
    to: recipientEmail,
    subject,
    body: html,
    sourceType: "vendor_statement",
    sourceId: vendorId,
    meta: { locale, vendorName: vendor.name, recipientEmail },
  });

  await notifyCompanyRoles({
    companyId: vendor.companyId,
    roles: ["owner", "admin", "accountant"],
    type: "vendor_statement_sent",
    actorId: user.id,
    data: {
      vendorName: vendor.name,
    },
  });

  await recordAuditEvent({
    companyId: vendor.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor.statement_sent",
    entity: "vendor",
    entityId: vendorId,
    metadata: { recipientEmail },
  });

  return NextResponse.json({ ok: true });
}
