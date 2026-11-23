import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { invoicePaymentSchema } from "@/lib/validators/sales";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { getInvoicePayment, listInvoicePayments } from "@/lib/data/invoice-payments";
import { createCashTransaction } from "@/lib/data/cash-transactions";
import { createJournalEntry } from "@/lib/data/journal-entries";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import {
  assertSameRequest,
  loadSettlementAccount,
  payInvoice,
  readPayableInvoices,
} from "@/lib/accounting/payments";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { notifyCompanyRoles } from "@/lib/notifications/service";
import { roundMoney } from "@/lib/utils/invoice";

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

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const closedPeriod = await periodClosedResponse(
    invoice.companyId,
    parsed.data.paymentDate
  );
  if (closedPeriod) {
    return closedPeriod;
  }

  const amount = roundMoney(parsed.data.amount);
  const paymentId = parsed.data.requestId ?? uuidv4();
  let result: { status: string; duplicate: boolean };
  try {
    const ledgerAccountId = await loadSettlementAccount(
      invoice.companyId,
      "receivable",
      parsed.data.accountId
    );
    result = await db.runTransaction(async (tx) => {
      const existing = await getInvoicePayment(paymentId, tx);
      if (existing) {
        assertSameRequest(existing, { companyId: invoice.companyId, amount });
        return { status: invoice.status, duplicate: true };
      }
      const [{ invoice: current }] = await readPayableInvoices(tx, {
        companyId: invoice.companyId,
        allocations: [{ invoiceId: invoice.id, amount }],
      });
      const journalEntryId = uuidv4();
      const { status } = await payInvoice(tx, current, {
        id: paymentId,
        amount,
        paymentDate: parsed.data.paymentDate,
        method: parsed.data.method,
        reference: parsed.data.reference ?? null,
        accountId: parsed.data.accountId,
        journalEntryId,
      });
      await createJournalEntry(
        {
          id: journalEntryId,
          companyId: invoice.companyId,
          sourceType: "invoice_payment",
          sourceId: invoice.id,
          date: parsed.data.paymentDate,
          memo: `Payment for ${invoice.invoiceNumber}`,
          lines: [
            { accountId: parsed.data.accountId, debit: amount, credit: 0 },
            { accountId: ledgerAccountId, debit: 0, credit: amount },
          ],
        },
        tx
      );
      await createCashTransaction(
        {
          companyId: invoice.companyId,
          accountId: parsed.data.accountId,
          date: parsed.data.paymentDate,
          amount,
          direction: "in",
          reference: parsed.data.reference ?? invoice.invoiceNumber,
          description: `Payment ${invoice.invoiceNumber}`,
          sourceType: "invoice_payment",
          sourceId: paymentId,
        },
        tx
      );
      return { status, duplicate: false };
    });
  } catch (error) {
    return postingErrorResponse(error);
  }
  if (result.duplicate) {
    return NextResponse.json({ ok: true, paymentId });
  }
  const { status } = result;

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.payment",
    entity: "sales_invoice",
    entityId: invoice.id,
    metadata: { paymentId, amount },
  });

  if (status === "paid") {
    await notifyCompanyRoles({
      companyId: invoice.companyId,
      roles: ["owner", "admin", "accountant"],
      type: "invoice_paid",
      actorId: user.id,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        amount: `${amount}`,
        currency: invoice.currency ?? "SAR",
      },
    });
  }

  return NextResponse.json({ ok: true, paymentId });
}
