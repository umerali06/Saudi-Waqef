import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getCustomerById } from "@/lib/data/customers";
import { getOutboxEmail } from "@/lib/data/email-outbox";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  emailId: z.string().min(1),
});

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

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = await getOutboxEmail(parsed.data.emailId);
  if (!email || email.companyId !== customer.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (email.sourceType !== "customer_statement" || email.sourceId !== customerId) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const resendId = await queueEmailWithDispatch({
    companyId: customer.companyId,
    to: email.to,
    subject: email.subject,
    body: email.body,
    sourceType: "customer_statement",
    sourceId: customerId,
    meta: { resendOf: email.id },
  });

  await notifyCompanyRoles({
    companyId: customer.companyId,
    roles: ["owner", "admin", "accountant"],
    type: "customer_statement_sent",
    actorId: user.id,
    data: { customerName: customer.name },
  });

  await recordAuditEvent({
    companyId: customer.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "customer.statement_resent",
    entity: "customer",
    entityId: customerId,
    metadata: { resendId, originalEmailId: email.id, recipientEmail: email.to },
  });

  return NextResponse.json({ ok: true, resendId });
}
