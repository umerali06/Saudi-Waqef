import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { cancelPurchaseBill } from "@/lib/accounting/purchases";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ billId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billId } = await context.params;
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["draft", "approved"].includes(bill.status)) {
    return NextResponse.json({ error: "Bill cannot be canceled" }, { status: 400 });
  }

  if (bill.amountPaid > 0 || bill.amountCredited > 0) {
    return NextResponse.json({ error: "Bill has allocations" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, bill.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(bill.companyId, bill.billDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  if (bill.status === "approved") {
    const closedPeriod = await periodClosedResponse(bill.companyId, bill.billDate);
    if (closedPeriod) {
      return closedPeriod;
    }
  }

  try {
    await cancelPurchaseBill(bill.id);
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: bill.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.cancel",
    entity: "purchase_bill",
    entityId: bill.id,
    metadata: { billNumber: bill.billNumber },
  });

  return NextResponse.json({ ok: true });
}
