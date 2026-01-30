import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { paymentMethodSchema } from "@/lib/validators/billing";
import {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
} from "@/lib/data/payment-methods";

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

  const methods = await listPaymentMethods(companyId);
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
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const methodId = await createPaymentMethod({
    companyId: parsed.data.companyId,
    type: parsed.data.type,
    brand: parsed.data.brand ?? null,
    last4: parsed.data.last4,
    expMonth: parsed.data.expMonth ?? null,
    expYear: parsed.data.expYear ?? null,
    token: parsed.data.token,
    isDefault: parsed.data.isDefault ?? false,
  });

  if (parsed.data.isDefault) {
    const methods = await listPaymentMethods(parsed.data.companyId);
    await Promise.all(
      methods
        .filter((method) => method.id !== methodId && method.isDefault)
        .map((method) => updatePaymentMethod(method.id, { isDefault: false }))
    );
  }

  return NextResponse.json({ methodId });
}

