import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireCompanyRole } from "@/lib/access";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { approvePurchaseBill } from "@/lib/accounting/purchases";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
import { getCompanyConfig } from "@/lib/data/company-config";
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

  if (bill.status !== "draft") {
    return NextResponse.json({ error: "Bill is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, bill.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getCompanyConfig(bill.companyId);
  const threshold = typeof config.billApprovalThreshold === "number"
    ? config.billApprovalThreshold
    : 0;
  if (threshold > 0 && bill.total >= threshold) {
    const allowed = hasRequiredRole(membership.role, ["owner", "admin"]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Approval requires owner or admin" },
        { status: 403 }
      );
    }
  }

  const lockedPeriod = await findFiledVatPeriod(bill.companyId, bill.billDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const closedPeriod = await periodClosedResponse(bill.companyId, bill.billDate);
  if (closedPeriod) {
    return closedPeriod;
  }

  let approved: Awaited<ReturnType<typeof approvePurchaseBill>>;
  try {
    approved = await approvePurchaseBill(bill);
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: bill.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.approve",
    entity: "purchase_bill",
    entityId: bill.id,
    metadata: { billNumber: bill.billNumber },
  });

  return NextResponse.json({ ok: true, ...approved });
}

