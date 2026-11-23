import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { cancelSalesInvoice } from "@/lib/accounting/sales";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";
import { isZatcaFinalized } from "@/lib/integrations/zatca/finality";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["draft", "approved"].includes(invoice.status)) {
    return NextResponse.json({ error: "Invoice cannot be canceled" }, { status: 400 });
  }

  if (invoice.amountPaid > 0 || invoice.amountCredited > 0) {
    return NextResponse.json({ error: "Invoice has allocations" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, invoice.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(
    invoice.companyId,
    invoice.invoiceDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  if (await isZatcaFinalized(invoice.companyId, invoice.id)) {
    return NextResponse.json({ error: "ZATCA_DOCUMENT_FINALIZED" }, { status: 400 });
  }

  if (invoice.status === "approved") {
    const closedPeriod = await periodClosedResponse(
      invoice.companyId,
      invoice.invoiceDate
    );
    if (closedPeriod) {
      return closedPeriod;
    }
  }

  try {
    await cancelSalesInvoice(invoice.id);
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: invoice.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.cancel",
    entity: "sales_invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });

  return NextResponse.json({ ok: true });
}
