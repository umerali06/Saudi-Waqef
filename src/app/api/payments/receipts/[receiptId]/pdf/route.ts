import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/access";
import { getSessionUser } from "@/lib/auth-helpers";
import { getPaymentReceiptById } from "@/lib/data/payment-receipts";
import { buildReceiptPdf } from "@/lib/pdf/company-documents";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ receiptId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await context.params;
  const receipt = await getPaymentReceiptById(receiptId);
  if (!receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await requireAccountingAccess(user.id, receipt.companyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const document = await buildReceiptPdf(receiptId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return pdfResponse(document.pdf, document.fileName, request);
}
