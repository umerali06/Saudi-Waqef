import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getExpenseById } from "@/lib/data/expenses";
import {
  getExpenseAttachment,
  deleteExpenseAttachment,
} from "@/lib/data/expense-attachments";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ expenseId: string; attachmentId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { expenseId, attachmentId } = await context.params;
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await getExpenseAttachment(attachmentId);
  if (!attachment || attachment.expenseId !== expenseId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, expense.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteExpenseAttachment(attachmentId);

  await recordAuditEvent({
    companyId: expense.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "expense.attachment.delete",
    entity: "expense",
    entityId: expenseId,
    metadata: { attachmentId, name: attachment.name },
  });

  return NextResponse.json({ ok: true });
}
