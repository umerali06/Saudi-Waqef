import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { invoicePaymentSchema } from "@/lib/validators/sales";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { listInvoicePayments, createInvoicePayment } from "@/lib/data/invoice-payments";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { updateOpenItemBalance } from "@/lib/data/open-items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, invoice.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payments = await listInvoicePayments(invoiceId);
  return NextResponse.json({ payments });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = invoicePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice || invoice.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (["draft", "canceled"].includes(invoice.status)) {
    return NextResponse.json({ error: "Invoice is locked" }, { status: 400 });
  }

  if (parsed.data.amount > invoice.balance) {
    return NextResponse.json({ error: "Amount exceeds balance" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [defaults, accounts] = await Promise.all([
    getCompanyDefaults(invoice.companyId),
    listChartAccounts(invoice.companyId),
  ]);

  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.has(parsed.data.accountId)) {
    return NextResponse.json({ error: "Invalid payment account" }, { status: 400 });
  }

  const receivableId = defaults.receivableAccountId;
  if (!receivableId || !accountIds.has(receivableId)) {
    return NextResponse.json({ error: "Missing receivable account" }, { status: 400 });
  }

  const journalEntryId = await createJournalEntry({
    companyId: invoice.companyId,
    sourceType: "invoice_payment",
    sourceId: invoice.id,
    date: parsed.data.paymentDate,
    memo: `Payment for ${invoice.invoiceNumber}`,
    lines: [
      {
        accountId: parsed.data.accountId,
        debit: parsed.data.amount,
        credit: 0,
      },
      {
        accountId: receivableId,
        debit: 0,
        credit: parsed.data.amount,
      },
    ],
  });

  const paymentId = await createInvoicePayment({
    companyId: invoice.companyId,
    invoiceId: invoice.id,
    paymentDate: parsed.data.paymentDate,
    amount: parsed.data.amount,
    method: parsed.data.method,
    reference: parsed.data.reference ?? null,
    accountId: parsed.data.accountId,
    journalEntryId,
  });

  const amountPaid = invoice.amountPaid + parsed.data.amount;
  const balance = Math.max(invoice.total - amountPaid - invoice.amountCredited, 0);
  const status = balance <= 0 ? "paid" : "partially_paid";

  await updateSalesInvoice(invoiceId, {
    amountPaid,
    balance,
    status,
  });

  if (invoice.openItemId) {
    await updateOpenItemBalance(invoice.openItemId, balance);
  }

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.payment",
    entity: "sales_invoice",
    entityId: invoice.id,
    metadata: { paymentId, amount: parsed.data.amount },
  });

  if (status === "paid") {
    await notifyCompanyRoles({
      companyId: invoice.companyId,
      roles: ["owner", "admin", "accountant"],
      type: "invoice_paid",
      actorId: user.id,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        amount: `${parsed.data.amount}`,
        currency: invoice.currency ?? "SAR",
      },
    });
  }

  return NextResponse.json({ ok: true, paymentId });
}
