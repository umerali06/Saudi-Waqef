import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/security/cron-auth";
import { runZatcaCertificateExpiryCheck } from "@/lib/integrations/zatca/certificate-expiry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const summary = await runZatcaCertificateExpiryCheck();
  return NextResponse.json({ ok: true, ...summary });
}
