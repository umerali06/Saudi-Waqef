import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { invoiceAttachmentSchema } from "@/lib/validators/sales";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import {
  createInvoiceAttachment,
  listInvoiceAttachments,
} from "@/lib/data/invoice-attachments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, invoice.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachments = await listInvoiceAttachments(invoiceId);
  return NextResponse.json({ attachments });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = invoiceAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== invoice.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, invoice.companyId, [
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

  const attachmentId = await createInvoiceAttachment({
    companyId: parsed.data.companyId,
    invoiceId,
    name: parsed.data.name,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    storage: parsed.data.storage,
    url: parsed.data.url ?? null,
    content: parsed.data.content ?? null,
  });

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.attachment.create",
    entity: "sales_invoice",
    entityId: invoiceId,
    metadata: { attachmentId, name: parsed.data.name, storage: parsed.data.storage },
  });

  return NextResponse.json({ attachmentId });
}

