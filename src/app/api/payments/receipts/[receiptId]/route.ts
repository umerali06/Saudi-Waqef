import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getPaymentReceiptById } from "@/lib/data/payment-receipts";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ receiptId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await context.params;
  const receipt = await getPaymentReceiptById(receiptId);
  if (!receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, receipt.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ receipt });
}

