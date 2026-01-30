import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getItemById } from "@/lib/data/items";
import { deleteItemAttachment, getItemAttachment } from "@/lib/data/item-attachments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ itemId: string; attachmentId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId, attachmentId } = await context.params;
  const item = await getItemById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await getItemAttachment(attachmentId);
  if (!attachment || attachment.itemId !== itemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (attachment.companyId !== item.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, item.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteItemAttachment(attachmentId);

  await recordAuditEvent({
    companyId: item.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "item.attachment.delete",
    entity: "item",
    entityId: itemId,
    metadata: { attachmentId, name: attachment.name },
  });

  return NextResponse.json({ ok: true });
}
