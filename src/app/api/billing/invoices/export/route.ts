import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { listBillingInvoices } from "@/lib/data/billing-invoices";
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

  const membership = await requireCompanyRole(user.id, companyId, ["owner", "admin"]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoices = await listBillingInvoices(companyId);
  const headers = [
    "ID",
    "Plan",
    "Amount",
    "Currency",
    "Status",
    "Period Start",
    "Period End",
    "Issued At",
  ];
  const rows = invoices.map((invoice) => [
    invoice.id,
    invoice.planName,
    String(invoice.amount),
    invoice.currency,
    invoice.status,
    invoice.periodStart,
    invoice.periodEnd,
    invoice.issuedAt ? invoice.issuedAt.toISOString() : "",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=billing-invoices.csv",
    },
  });
}
