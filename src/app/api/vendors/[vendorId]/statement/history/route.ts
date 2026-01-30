import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getVendorById } from "@/lib/data/vendors";
import { listOutboxEmailsBySource } from "@/lib/data/email-outbox";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ vendorId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
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

  const emails = await listOutboxEmailsBySource({
    companyId: vendor.companyId,
    sourceType: "vendor_statement",
    sourceId: vendorId,
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
