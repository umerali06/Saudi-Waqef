import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/access";
import { getSessionUser } from "@/lib/auth-helpers";
import { getVendorById } from "@/lib/data/vendors";
import { pdfResponse } from "@/lib/pdf/respond";
import { buildStatementPdf } from "@/lib/pdf/statement";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ vendorId: string }>;
};

/** `?from`, `?to` (YYYY-MM-DD) and `?locale` are optional. */
export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vendorId } = await context.params;
  const vendor = await getVendorById(vendorId);
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await requireAccountingAccess(user.id, vendor.companyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statement = await buildStatementPdf({
    partyType: "vendor",
    partyId: vendorId,
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    locale: searchParams.get("locale"),
  });
  if (!statement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return pdfResponse(statement.pdf, statement.fileName, request);
}
