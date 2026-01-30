import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyMembership } from "@/lib/access";
import {
  createSupportTicket,
  listSupportTickets,
} from "@/lib/data/support-tickets";
import { supportTicketSchema } from "@/lib/validators/support";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { createTelemetryEvent } from "@/lib/data/telemetry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tickets = await listSupportTickets(companyId);
  const isAdmin = ["owner", "admin"].includes(membership.role);
  const filtered = isAdmin ? tickets : tickets.filter((ticket) => ticket.userId === user.id);

  return NextResponse.json({ tickets: filtered });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = supportTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ticketId = await createSupportTicket({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    subject: parsed.data.subject,
    category: parsed.data.category,
    priority: parsed.data.priority,
    message: parsed.data.message,
    locale: parsed.data.locale ?? null,
  });

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "support.ticket.create",
    entity: "support_ticket",
    entityId: ticketId,
    metadata: { subject: parsed.data.subject, category: parsed.data.category },
  });

  await createTelemetryEvent({
    name: "support.ticket.created",
    companyId: parsed.data.companyId,
    userId: user.id,
    metadata: { category: parsed.data.category, priority: parsed.data.priority },
  });

  return NextResponse.json({ ticketId });
}
