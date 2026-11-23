import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess } from "@/lib/access";
import { getCustomerById } from "@/lib/data/customers";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { listOpenItemsByCompany, buildAgingByParty } from "@/lib/data/open-items";
import { roundMoney } from "@/lib/utils/invoice";
import { outstandingBalance } from "@/lib/utils/settlement";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

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

  const [invoices, credits, openItems] = await Promise.all([
    listSalesInvoices(customer.companyId),
    listSalesCreditNotes(customer.companyId),
    listOpenItemsByCompany(customer.companyId),
  ]);

  const customerInvoices = invoices.filter(
    (inv) => inv.customerId === customerId && !["draft", "canceled"].includes(inv.status)
  );
  const customerCredits = credits.filter(
    (note) => note.customerId === customerId && note.status === "issued"
  );

  const agingMap = buildAgingByParty(
    openItems.filter((item) => item.partyType === "customer")
  );
  const aging = agingMap.get(customerId)?.aging ?? null;

  const statementLines = customerInvoices.map((invoice) => {
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      total: roundMoney(invoice.total + invoice.amountDebited),
      paid: invoice.amountPaid,
      credited: invoice.amountCredited,
      balance: outstandingBalance(invoice),
      currency: invoice.currency ?? "SAR",
    };
  });

  const totals = statementLines.reduce(
    (acc, line) => {
      acc.invoiced += line.total;
      acc.paid += line.paid;
      acc.credited += line.credited;
      acc.balance += line.balance;
      return acc;
    },
    { invoiced: 0, paid: 0, credited: 0, balance: 0 }
  );

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email ?? null,
      currency: customer.currency ?? "SAR",
    },
    totals,
    aging,
    invoices: statementLines,
    creditNotes: customerCredits.map((note) => ({
      id: note.id,
      creditNumber: note.creditNumber,
      issueDate: note.issueDate,
      total: note.total,
      status: note.status,
      currency: note.currency ?? "SAR",
    })),
  });
}
