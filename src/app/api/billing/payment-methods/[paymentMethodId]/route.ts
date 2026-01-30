import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { paymentMethodUpdateSchema } from "@/lib/validators/billing";
import { updatePaymentMethod, deletePaymentMethod } from "@/lib/data/payment-methods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ paymentMethodId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentMethodUpdateSchema.safeParse(body);
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

  const { paymentMethodId } = await context.params;
  await updatePaymentMethod(paymentMethodId, {
    isDefault: parsed.data.isDefault,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { paymentMethodId } = await context.params;
  await deletePaymentMethod(paymentMethodId);
  return NextResponse.json({ ok: true });
}
