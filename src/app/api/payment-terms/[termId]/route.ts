import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { paymentTermUpdateSchema } from "@/lib/validators/company";
import { getPaymentTerm, updatePaymentTerm } from "@/lib/data/payment-terms";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ termId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentTermUpdateSchema.safeParse(body);
  if (!parsed.success || typeof body?.companyId !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, body.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { termId } = await context.params;
  const term = await getPaymentTerm(termId);
  if (!term || term.companyId !== body.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await updatePaymentTerm(termId, parsed.data);
  await recordAuditEvent({
    companyId: body.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "payment_term.update",
    entity: "payment_term",
    entityId: termId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ok: true });
}
