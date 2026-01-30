import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { expenseAttachmentSchema } from "@/lib/validators/expenses";
import { getExpenseById } from "@/lib/data/expenses";
import {
  createExpenseAttachment,
  listExpenseAttachments,
} from "@/lib/data/expense-attachments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

type RouteContext = {
  params: Promise<{ expenseId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId } = await context.params;
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, expense.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachments = await listExpenseAttachments(expenseId);
  return NextResponse.json({ attachments });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId } = await context.params;
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = expenseAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== expense.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, expense.companyId, [
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

  const attachmentId = await createExpenseAttachment({
    companyId: parsed.data.companyId,
    expenseId,
    name: parsed.data.name,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    storage: parsed.data.storage,
    url: parsed.data.url ?? null,
    content: parsed.data.content ?? null,
  });

  await recordAuditEvent({
    companyId: expense.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "expense.attachment.create",
    entity: "expense",
    entityId: expenseId,
    metadata: { attachmentId, name: parsed.data.name, storage: parsed.data.storage },
  });

  return NextResponse.json({ attachmentId });
}

