import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getCustomerById } from "@/lib/data/customers";
import { listOutboxEmailsBySource } from "@/lib/data/email-outbox";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
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

  const emails = await listOutboxEmailsBySource({
    companyId: customer.companyId,
    sourceType: "customer_statement",
    sourceId: customerId,
    limit: 20,
  });

  return NextResponse.json({
    emails: emails.map((email) => ({
      id: email.id,
      to: email.to,
      subject: email.subject,
      status: email.status,
      attempts: email.attempts,
      lastError: email.lastError ?? null,
      createdAt: email.createdAt,
    })),
  });
}
