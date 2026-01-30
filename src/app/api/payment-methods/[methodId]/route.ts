import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getAccountingPaymentMethodById,
  updateAccountingPaymentMethod,
} from "@/lib/data/accounting-payment-methods";
import { paymentMethodUpdateSchema } from "@/lib/validators/payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ methodId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { methodId } = await context.params;
  const method = await getAccountingPaymentMethodById(methodId);
  if (!method) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, method.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentMethodUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.defaultAccountId) {
    const coa = await listChartAccounts(method.companyId);
    const account = coa.find((entry) => entry.id === parsed.data.defaultAccountId);
    if (!account || !account.isPosting) {
      return NextResponse.json({ error: "Invalid account" }, { status: 400 });
    }
  }

  await updateAccountingPaymentMethod(methodId, parsed.data);
  await recordAuditEvent({
    companyId: method.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "paymentMethod.update",
    entity: "payment_method",
    entityId: methodId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}
