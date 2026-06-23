import { NextResponse } from "next/server";
import { listVatPeriods } from "@/lib/data/vat-periods";
import { withExternalApiAuth } from "@/lib/security/external-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withExternalApiAuth(request, ["read:reports"], async ({ companyId }) => {
    const periods = await listVatPeriods(companyId);
    return NextResponse.json({ data: periods });
  });
}
