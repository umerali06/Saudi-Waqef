import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import {
  addSupportTicketReply,
  getSupportTicketById,
  updateSupportTicket,
} from "@/lib/data/support-tickets";
import { createNotification } from "@/lib/data/notifications";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { renderEmail } from "@/lib/email/template";
import { supportTicketAdminUpdateSchema } from "@/lib/validators/support";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = supportTicketAdminUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { ticketId } = await context.params;
  const ticket = await getSupportTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { reply } = parsed.data;
  const status =
    parsed.data.status ?? (reply && ticket.status === "open" ? "in_progress" : undefined);
  if (reply) {
    await addSupportTicketReply(ticketId, {
      message: reply,
      authorEmail: access.user?.email ?? null,
    });
  }
  if (status) {
    await updateSupportTicket(ticketId, { status });
  }

  if (reply) {
    const arabic = ticket.locale !== "en";
    const baseUrl = (process.env.NEXTAUTH_URL?.trim() || new URL(request.url).origin).replace(
      /\/+$/,
      ""
    );
    const subject = arabic
      ? `رد على طلب الدعم: ${ticket.subject}`
      : `Reply to your support ticket: ${ticket.subject}`;
    await Promise.allSettled([
      createNotification({
        companyId: ticket.companyId,
        userId: ticket.userId,
        type: "support_ticket",
        title: subject,
        body: reply,
        data: { ticketId },
      }),
      ...(ticket.userEmail
        ? [
            queueEmailWithDispatch({
              companyId: ticket.companyId,
              to: ticket.userEmail,
              subject,
              body: renderEmail({
                locale: arabic ? "ar" : "en",
                heading: ticket.subject,
                paragraphs: [
                  arabic ? "رد فريق الدعم على طلبك:" : "The support team replied to your ticket:",
                  reply,
                ],
                action: {
                  label: arabic ? "عرض الطلب" : "View ticket",
                  url: `${baseUrl}/support`,
                },
              }),
              sourceType: "support_ticket",
              sourceId: ticketId,
            }),
          ]
        : []),
    ]);
  }

  await recordAuditEvent({
    companyId: "system",
    userId: access.user?.id ?? "system",
    userEmail: access.user?.email ?? undefined,
    action: "admin.support.ticket.update",
    entity: "support_ticket",
    entityId: ticketId,
    metadata: { status: status ?? null, replied: Boolean(reply) },
  });

  return NextResponse.json({ success: true });
}
