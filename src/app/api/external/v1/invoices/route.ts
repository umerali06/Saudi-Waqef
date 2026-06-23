import { NextResponse } from "next/server";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { withExternalApiAuth } from "@/lib/security/external-api";
import { normalizeSearch } from "@/lib/utils/search";

export const runtime = "nodejs";

const parseBoolean = (value: string | null) => {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeSearch(value);
  if (["true", "yes", "1", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const parseLimit = (value: string | null) => {
  const parsed = Number(value ?? "100");
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
};

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:accounting"], async ({ companyId }) => {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    const from = searchParams.get("from") ?? searchParams.get("startDate");
    const to = searchParams.get("to") ?? searchParams.get("endDate");
    const overdue = parseBoolean(searchParams.get("overdue"));
    const q = normalizeSearch(searchParams.get("q") ?? "");
    const includeLines = parseBoolean(searchParams.get("includeLines")) === true;
    const limit = parseLimit(searchParams.get("limit"));

    const today = new Date().toISOString().slice(0, 10);
    let invoices = await listSalesInvoices(companyId);

    if (status && status !== "all") {
      invoices = invoices.filter((invoice) => invoice.status === status);
    }
    if (customerId) {
      invoices = invoices.filter((invoice) => invoice.customerId === customerId);
    }
    if (from) {
      invoices = invoices.filter((invoice) => invoice.invoiceDate >= from);
    }
    if (to) {
      invoices = invoices.filter((invoice) => invoice.invoiceDate <= to);
    }
    if (overdue === true) {
      invoices = invoices.filter(
        (invoice) =>
          invoice.balance > 0 &&
          invoice.dueDate < today &&
          invoice.status !== "canceled"
      );
    }
    if (q) {
      invoices = invoices.filter(
        (invoice) =>
          normalizeSearch(invoice.invoiceNumber).includes(q) ||
          normalizeSearch(invoice.customerName).includes(q)
      );
    }

    invoices.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

    return NextResponse.json({
      data: invoices.slice(0, limit).map((invoice) => ({
        id: invoice.id,
        companyId: invoice.companyId,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        customerVatNumber: invoice.customerVatNumber ?? null,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency,
        subtotal: invoice.subtotal,
        discountTotal: invoice.discountTotal,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        amountCredited: invoice.amountCredited,
        balance: invoice.balance,
        createdAt: invoice.createdAt,
        lines: includeLines ? invoice.lines : undefined,
      })),
      meta: {
        count: Math.min(invoices.length, limit),
        total: invoices.length,
        limit,
      },
    });
  });
}
