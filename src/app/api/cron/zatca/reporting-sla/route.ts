import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/cron-auth";
import { runZatcaReportingSlaCheck } from "@/lib/integrations/zatca/reporting-sla";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const summary = await runZatcaReportingSlaCheck();
  return NextResponse.json({ ok: true, ...summary });
}
