import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { listSupportTickets } from "@/lib/data/support-tickets";
import { toCsv } from "@/lib/utils/csv";

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

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tickets = await listSupportTickets(companyId);

  const headers = [
    "ID",
    "Subject",
    "Category",
    "Priority",
    "Status",
    "Requester",
    "Created At",
    "Updated At",
  ];

  const rows = tickets.map((ticket) => [
    ticket.id,
    ticket.subject,
    ticket.category,
    ticket.priority,
    ticket.status,
    ticket.userEmail ?? "",
    ticket.createdAt.toISOString(),
    ticket.updatedAt ? ticket.updatedAt.toISOString() : "",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=support-tickets.csv",
    },
  });
}
