import { NextResponse } from "next/server";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  return withExternalApiAuth(request, ["read:accounting"], async ({ companyId }) => {
    const { invoiceId } = await params;
    const invoice = await getSalesInvoiceById(invoiceId);
    if (!invoice || invoice.companyId !== companyId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: invoice });
  });
}
