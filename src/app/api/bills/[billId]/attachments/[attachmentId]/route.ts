import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
import { getBillAttachment, deleteBillAttachment } from "@/lib/data/bill-attachments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ billId: string; attachmentId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billId, attachmentId } = await context.params;
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await getBillAttachment(attachmentId);
  if (!attachment || attachment.billId !== billId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, bill.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteBillAttachment(attachmentId);

  await recordAuditEvent({
    companyId: bill.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.attachment.delete",
    entity: "purchase_bill",
    entityId: billId,
    metadata: { attachmentId, name: attachment.name },
  });

  return NextResponse.json({ ok: true });
}
