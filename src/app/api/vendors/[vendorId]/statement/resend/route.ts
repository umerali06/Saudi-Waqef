import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getVendorById } from "@/lib/data/vendors";
import { getOutboxEmail } from "@/lib/data/email-outbox";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  emailId: z.string().min(1),
});

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

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = await getOutboxEmail(parsed.data.emailId);
  if (!email || email.companyId !== vendor.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (email.sourceType !== "vendor_statement" || email.sourceId !== vendorId) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const resendId = await queueEmailWithDispatch({
    companyId: vendor.companyId,
    to: email.to,
    subject: email.subject,
    body: email.body,
    sourceType: "vendor_statement",
    sourceId: vendorId,
    meta: { resendOf: email.id },
  });

  await notifyCompanyRoles({
    companyId: vendor.companyId,
    roles: ["owner", "admin", "accountant"],
    type: "vendor_statement_sent",
    actorId: user.id,
    data: { vendorName: vendor.name },
  });

  await recordAuditEvent({
    companyId: vendor.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor.statement_resent",
    entity: "vendor",
    entityId: vendorId,
    metadata: { resendId, originalEmailId: email.id, recipientEmail: email.to },
  });

  return NextResponse.json({ ok: true, resendId });
}
