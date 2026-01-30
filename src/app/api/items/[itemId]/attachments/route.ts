import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { itemAttachmentSchema } from "@/lib/validators/items";
import { getItemById } from "@/lib/data/items";
import { createItemAttachment, listItemAttachments } from "@/lib/data/item-attachments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await getItemById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, item.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachments = await listItemAttachments(itemId);
  return NextResponse.json({ attachments });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await getItemById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = itemAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== item.companyId) {
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

  if (parsed.data.storage === "cloudinary" && !parsed.data.url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  if (parsed.data.storage === "firestore" && !parsed.data.content) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }
  if (
    parsed.data.storage === "firestore" &&
    parsed.data.size > FIRESTORE_ATTACHMENT_LIMIT
  ) {
    return NextResponse.json({ error: "Attachment too large" }, { status: 400 });
  }

  const attachmentId = await createItemAttachment({
    companyId: parsed.data.companyId,
    itemId,
    name: parsed.data.name,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    storage: parsed.data.storage,
    url: parsed.data.url ?? null,
    content: parsed.data.content ?? null,
  });

  await recordAuditEvent({
    companyId: item.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "item.attachment.create",
    entity: "item",
    entityId: itemId,
    metadata: { attachmentId, name: parsed.data.name, storage: parsed.data.storage },
  });

  return NextResponse.json({ attachmentId });
}

