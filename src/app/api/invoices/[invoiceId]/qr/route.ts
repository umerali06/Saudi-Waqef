import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAccountingAccess } from "@/lib/access";
import { getSessionUser } from "@/lib/auth-helpers";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { resolveTaxIdentity } from "@/lib/pdf/tax-document-data";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

/** The QR and legal seller details of an invoice, for showing on screen. */
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
  if (!(await requireAccountingAccess(user.id, invoice.companyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const identity = await resolveTaxIdentity("invoice", invoiceId);
  if (!identity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    seller: identity.seller,
    qr: identity.qr
      ? await QRCode.toDataURL(identity.qr, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      : null,
    source: identity.qr ? (identity.filed ? "zatca" : "phase1") : null,
  });
}
