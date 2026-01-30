import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import {
  listAccountingPaymentMethods,
  createAccountingPaymentMethod,
} from "@/lib/data/accounting-payment-methods";
import { paymentMethodSchema } from "@/lib/validators/payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const methods = await listAccountingPaymentMethods(companyId);
  return NextResponse.json({ methods });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentMethodSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.defaultAccountId) {
    const coa = await listChartAccounts(parsed.data.companyId);
    const account = coa.find((entry) => entry.id === parsed.data.defaultAccountId);
    if (!account || !account.isPosting) {
      return NextResponse.json({ error: "Invalid account" }, { status: 400 });
    }
  }

  const id = await createAccountingPaymentMethod({
    companyId: parsed.data.companyId,
    code: parsed.data.code,
    name: parsed.data.name,
    defaultAccountId: parsed.data.defaultAccountId ?? null,
    status: parsed.data.status ?? "active",
    isSystem: false,
  });
  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "paymentMethod.create",
    entity: "payment_method",
    entityId: id,
    metadata: { code: parsed.data.code },
  });

  return NextResponse.json({ id });
}

