import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { listPaymentMethods } from "@/lib/data/payment-methods";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, ["owner", "admin"]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const methods = await listPaymentMethods(companyId);
  const headers = ["ID", "Type", "Brand", "Last4", "Exp Month", "Exp Year", "Default"];
  const rows = methods.map((method) => [
    method.id,
    method.type,
    method.brand ?? "",
    method.last4,
    method.expMonth ? String(method.expMonth) : "",
    method.expYear ? String(method.expYear) : "",
    method.isDefault ? "true" : "false",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=billing-payment-methods.csv",
    },
  });
}
