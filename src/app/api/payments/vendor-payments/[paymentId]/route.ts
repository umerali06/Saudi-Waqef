import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getVendorPaymentById } from "@/lib/data/vendor-payments";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentId } = await context.params;
  const payment = await getVendorPaymentById(paymentId);
  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, payment.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ payment });
}

