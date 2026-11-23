import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { getCompanyById } from "@/lib/data/companies";
import { listAllSupportTickets } from "@/lib/data/support-tickets";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const tickets = await listAllSupportTickets();
  const companyIds = Array.from(new Set(tickets.map((ticket) => ticket.companyId)));
  const companies = new Map(
    await Promise.all(
      companyIds.map(
        async (id) => [id, (await getCompanyById(id))?.name ?? ""] as [string, string]
      )
    )
  );

  return NextResponse.json({
    tickets: tickets.map((ticket) => ({
      ...ticket,
      companyName: companies.get(ticket.companyId) ?? "",
    })),
  });
}
