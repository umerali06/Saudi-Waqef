import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getCustomerById } from "@/lib/data/customers";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { listInvoicePayments } from "@/lib/data/invoice-payments";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

const safeFilename = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await context.params;
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, customer.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [invoices, credits] = await Promise.all([
    listSalesInvoices(customer.companyId),
    listSalesCreditNotes(customer.companyId),
  ]);

  const customerInvoices = invoices.filter((inv) => inv.customerId === customerId);
  const customerCredits = credits.filter((note) => note.customerId === customerId);

  const paymentMap = new Map<string, number>();
  for (const invoice of customerInvoices) {
    const payments = await listInvoicePayments(invoice.id);
    paymentMap.set(
      invoice.id,
      payments.reduce((sum, p) => sum + p.amount, 0)
    );
  }

  const rows: string[][] = [];

  customerInvoices.forEach((invoice) => {
    const paid = paymentMap.get(invoice.id) ?? 0;
    const credited = invoice.amountCredited ?? 0;
    const balance = Math.max(invoice.total - paid - credited, 0);
    rows.push([
      "invoice",
      invoice.invoiceNumber,
      invoice.invoiceDate,
      invoice.dueDate,
      invoice.status,
      String(invoice.total),
      String(paid),
      String(credited),
      String(balance),
      invoice.currency ?? "SAR",
    ]);
  });

  customerCredits.forEach((note) => {
    rows.push([
      "credit_note",
      note.creditNumber,
      note.issueDate,
      "",
      note.status,
      String(note.total),
      "0",
      String(note.total),
      "0",
      note.currency ?? "SAR",
    ]);
  });

  const headers = [
    "type",
    "number",
    "issueDate",
    "dueDate",
    "status",
    "total",
    "paid",
    "credited",
    "balance",
    "currency",
  ];

  const csv = toCsv(headers, rows);
  const filename = safeFilename(customer.name || "customer");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=statement-${filename}.csv`,
      "Cache-Control": "no-store",
    },
  });
}
