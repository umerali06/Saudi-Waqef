import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/access";
import { getSessionUser } from "@/lib/auth-helpers";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
import { buildBillPdf } from "@/lib/pdf/company-documents";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ billId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billId } = await context.params;
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await requireAccountingAccess(user.id, bill.companyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const document = await buildBillPdf(billId);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return pdfResponse(document.pdf, document.fileName, request);
}
