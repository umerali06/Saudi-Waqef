import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/access";
import { getSessionUser } from "@/lib/auth-helpers";
import { getVendorPaymentById } from "@/lib/data/vendor-payments";
import { buildVendorPaymentPdf } from "@/lib/pdf/company-documents";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentId } = await context.params;
  const payment = await getVendorPaymentById(paymentId);
  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await requireAccountingAccess(user.id, payment.companyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const document = await buildVendorPaymentPdf(paymentId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return pdfResponse(document.pdf, document.fileName, request);
}
