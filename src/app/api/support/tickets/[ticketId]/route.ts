import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess, requireCompanyMembership } from "@/lib/access";
import { getSupportTicketById, updateSupportTicket } from "@/lib/data/support-tickets";
import { supportTicketUpdateSchema } from "@/lib/validators/support";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    ticketId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ticketId } = await context.params;
  const ticket = await getSupportTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyMembership(user.id, ticket.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = supportTicketUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const canManage = await requireAdminAccess(user.id, ticket.companyId);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await updateSupportTicket(ticketId, parsed.data);

  await recordAuditEvent({
    companyId: ticket.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "support.ticket.update",
    entity: "support_ticket",
    entityId: ticketId,
    metadata: { status: parsed.data.status },
  });

  return NextResponse.json({ success: true });
}
